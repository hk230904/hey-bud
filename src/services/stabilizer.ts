import { TrackerFrameData } from "@/lib/hand-tracker";
import { getDistance, Landmark } from "./gestureClassifier";

export interface PipelineFeedback {
  handDetectedStatus: "Detected" | "Not Detected";
  stabilityStatus: "Stable" | "Unstable" | "Flicker Protection Locked";
  positionStatus: "Centered" | "Too Close" | "Too Far" | "Off-center";
  actionGuide: string;
  trackingStatus: string;
  fps: number;
}

export class TemporalStabilizer {
  // Configs
  private fastWindowSize = 3;
  private fastMinConfidence = 0.70;
  
  private confirmedWindowSize = 6;
  private confirmedMinConfidence = 0.85;
  private holdDurationMs = 250; // hold duration for confirmation
  private lockDurationMs = 350; // lock after confirmation to prevent double trigger

  // State
  private predictionHistory: { gesture: string; confidence: number }[] = [];
  private lastLandmarks: Landmark[] | null = null;
  private currentStableGesture = "Unknown";
  private acceptedGesture = "Unknown";
  
  // Timers
  private holdStartTime: number | null = null;
  private lockEndTime = 0;

  // Frame counting for FPS
  private frameCount = 0;
  private lastFpsUpdateTime = performance.now();
  private currentFps = 0;

  public processFrame(
    frameData: TrackerFrameData,
    rawPrediction: { gesture: string; confidence: number } | null
  ): {
    acceptedGesture: string;
    confidence: number;
    feedback: PipelineFeedback;
    shouldSave: boolean;
    preliminaryGesture: string;
    isConfirmed: boolean;
    averageConfidence: number;
    stabilityScore: number;
  } {
    // 1. Calculate FPS
    this.frameCount++;
    const now = performance.now();
    const elapsedFpsTime = now - this.lastFpsUpdateTime;
    if (elapsedFpsTime >= 1000) {
      this.currentFps = Math.round((this.frameCount * 1000) / elapsedFpsTime);
      this.frameCount = 0;
      this.lastFpsUpdateTime = now;
    }

    // Default feedback structure
    const feedback: PipelineFeedback = {
      handDetectedStatus: frameData.handDetected ? "Detected" : "Not Detected",
      stabilityStatus: "Unstable",
      positionStatus: "Centered",
      actionGuide: "Awaiting hand placement...",
      trackingStatus: "Searching...",
      fps: this.currentFps,
    };

    // If lock is active, return locked state
    const isLocked = now < this.lockEndTime;
    if (isLocked) {
      feedback.stabilityStatus = "Flicker Protection Locked";
      feedback.actionGuide = "Gesture recognized! Locking output...";
      return {
        acceptedGesture: this.acceptedGesture,
        confidence: 1.0,
        feedback,
        shouldSave: false,
        preliminaryGesture: this.acceptedGesture,
        isConfirmed: true,
        averageConfidence: 1.0,
        stabilityScore: 100,
      };
    }

    // Stage 1: Hand Detection check
    if (!frameData.handDetected || !frameData.landmarks) {
      this.predictionHistory = [];
      this.holdStartTime = null;
      this.currentStableGesture = "Unknown";
      this.acceptedGesture = "Unknown";
      this.lastLandmarks = null;
      
      feedback.handDetectedStatus = "Not Detected";
      feedback.actionGuide = "Place your hand inside the camera guide box";
      feedback.trackingStatus = "No Hand Detected";
      
      return {
        acceptedGesture: "Unknown",
        confidence: 0,
        feedback,
        shouldSave: false,
        preliminaryGesture: "Unknown",
        isConfirmed: false,
        averageConfidence: 0,
        stabilityScore: 0,
      };
    }

    const landmarks = frameData.landmarks;
    feedback.trackingStatus = frameData.isLeftHand ? "Left Hand Tracking" : "Right Hand Tracking";

    // Stage 2: Hand presence count (Warning only - DO NOT BLOCK)
    if (frameData.handCount > 1) {
      feedback.trackingStatus = "Multiple Hands Detected";
      feedback.actionGuide = "Suggest: Use one hand only for better accuracy";
    }

    // Stage 3 & 4: Position and Distance checks (Warnings only - DO NOT BLOCK)
    // Guide Box: X in [0.20, 0.80], Y in [0.15, 0.85] from hand-tracker.ts
    const wrist = landmarks[0];
    const mcp9 = landmarks[9];
    
    const isOffCenter = 
      wrist.x < 0.20 || wrist.x > 0.80 ||
      wrist.y < 0.15 || wrist.y > 0.85 ||
      mcp9.x < 0.20 || mcp9.x > 0.80 ||
      mcp9.y < 0.15 || mcp9.y > 0.85;

    if (isOffCenter) {
      feedback.positionStatus = "Off-center";
      feedback.actionGuide = "Suggest: Center hand in the camera guide box";
    } else {
      feedback.positionStatus = "Centered";
    }

    const rawDist = getDistance(wrist, mcp9);
    if (rawDist < 0.12) {
      feedback.positionStatus = "Too Far";
      feedback.actionGuide = "Suggest: Move hand closer to camera";
    } else if (rawDist > 0.35) {
      feedback.positionStatus = "Too Close";
      feedback.actionGuide = "Suggest: Move hand back from camera";
    }

    // Stage 5: Motion Blur & Velocity detection (Warning only - DO NOT BLOCK)
    let motionBlur = false;
    if (this.lastLandmarks) {
      let totalDisplacement = 0;
      for (let i = 0; i < 21; i++) {
        totalDisplacement += getDistance(landmarks[i], this.lastLandmarks[i]);
      }
      const avgVelocity = totalDisplacement / 21;
      if (avgVelocity > 0.05) {
        motionBlur = true;
      }
    }
    this.lastLandmarks = landmarks;

    if (motionBlur) {
      feedback.actionGuide = "Suggest: Hold hand steady";
    }

    // Append to prediction history (last 10 predictions)
    this.predictionHistory.push(rawPrediction || { gesture: "Unknown", confidence: 0 });
    if (this.predictionHistory.length > 10) {
      this.predictionHistory.shift();
    }

    const histLen = this.predictionHistory.length;

    // --- STAGE 1: Fast Prediction Stage (Last 3 frames, Threshold 70%) ---
    let preliminaryGesture = "Unknown";
    let preliminaryConf = 0;
    
    const fastWindow = this.predictionHistory.slice(Math.max(0, histLen - this.fastWindowSize));
    const fastCounts: Record<string, number> = {};
    const fastSums: Record<string, number> = {};
    
    fastWindow.forEach((p) => {
      fastCounts[p.gesture] = (fastCounts[p.gesture] || 0) + 1;
      fastSums[p.gesture] = (fastSums[p.gesture] || 0) + p.confidence;
    });

    let fastDominant = "Unknown";
    let fastDominantCount = 0;
    Object.entries(fastCounts).forEach(([g, count]) => {
      if (count > fastDominantCount) {
        fastDominantCount = count;
        fastDominant = g;
      }
    });

    if (fastDominant !== "Unknown") {
      const avgFastConf = fastSums[fastDominant] / fastDominantCount;
      if (avgFastConf >= this.fastMinConfidence) {
        preliminaryGesture = fastDominant;
        preliminaryConf = avgFastConf;
      }
    }

    // --- STAGE 2: Confirmed Prediction Stage (Last 6 frames, Threshold 85%, Weighted Avg) ---
    let confirmedGesture = "Unknown";
    let shouldSave = false;
    let isConfirmed = false;

    const confirmedWindow = this.predictionHistory.slice(Math.max(0, histLen - this.confirmedWindowSize));
    const confirmedCounts: Record<string, number> = {};
    confirmedWindow.forEach((p) => {
      confirmedCounts[p.gesture] = (confirmedCounts[p.gesture] || 0) + 1;
    });

    let confirmedDominant = "Unknown";
    let confirmedDominantCount = 0;
    Object.entries(confirmedCounts).forEach(([g, count]) => {
      if (count > confirmedDominantCount) {
        confirmedDominantCount = count;
        confirmedDominant = g;
      }
    });

    // Compute stability score (percentage of matching predictions in the confirmed window size)
    const stabilityScore = confirmedWindow.length > 0
      ? Math.round((confirmedDominantCount / confirmedWindow.length) * 100)
      : 0;

    // Calculate weighted average confidence across the last 10 predictions for the dominant gesture
    let weightedConfidence = 0;
    if (confirmedDominant !== "Unknown") {
      let totalWeight = 0;
      let weightedSum = 0;
      for (let i = 0; i < histLen; i++) {
        // Newer frames have higher weights (index + 1)
        const weight = i + 1;
        totalWeight += weight;
        if (this.predictionHistory[i].gesture === confirmedDominant) {
          weightedSum += this.predictionHistory[i].confidence * weight;
        }
      }
      weightedConfidence = totalWeight > 0 ? weightedSum / totalWeight : 0;
    }

    // Determine stability & check confirmation threshold (85% weighted confidence + dominant count >= 3 in confirmed window)
    const isStable = confirmedDominant !== "Unknown" && confirmedDominantCount >= 3;
    if (isStable) {
      feedback.stabilityStatus = "Stable";
      
      if (this.currentStableGesture !== confirmedDominant) {
        this.currentStableGesture = confirmedDominant;
        this.holdStartTime = now;
      } else {
        const holdTimeElapsed = this.holdStartTime ? now - this.holdStartTime : 0;
        
        // Confirm if hold duration reached AND weighted confidence meets 85%
        if (holdTimeElapsed >= this.holdDurationMs && weightedConfidence >= this.confirmedMinConfidence) {
          confirmedGesture = confirmedDominant;
          isConfirmed = true;
          
          if (this.acceptedGesture !== confirmedDominant) {
            this.acceptedGesture = confirmedDominant;
            this.lockEndTime = now + this.lockDurationMs;
            shouldSave = true;
            feedback.stabilityStatus = "Flicker Protection Locked";
            feedback.actionGuide = `Recognized "${confirmedDominant}"! Locking...`;
          }
        }
      }
    } else {
      feedback.stabilityStatus = "Unstable";
      this.currentStableGesture = "Unknown";
      this.holdStartTime = null;
    }

    // Ensure we keep recommending the accepted gesture if locked
    const finalAccepted = isConfirmed ? confirmedGesture : this.acceptedGesture;

    // Default action guide when stable or predicting
    if (feedback.stabilityStatus === "Stable" && !isConfirmed) {
      feedback.actionGuide = `Confirming "${confirmedDominant}"...`;
    } else if (preliminaryGesture !== "Unknown" && !isConfirmed) {
      feedback.actionGuide = `Predicting "${preliminaryGesture}"...`;
    }

    return {
      acceptedGesture: finalAccepted,
      confidence: isConfirmed ? weightedConfidence : (preliminaryGesture !== "Unknown" ? preliminaryConf : weightedConfidence),
      feedback,
      shouldSave,
      preliminaryGesture,
      isConfirmed,
      averageConfidence: weightedConfidence,
      stabilityScore,
    };
  }

  public reset() {
    this.predictionHistory = [];
    this.lastLandmarks = null;
    this.currentStableGesture = "Unknown";
    this.acceptedGesture = "Unknown";
    this.holdStartTime = null;
    this.lockEndTime = 0;
  }
}
