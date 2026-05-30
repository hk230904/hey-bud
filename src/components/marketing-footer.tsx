import { Link } from "@tanstack/react-router";
import { Hand } from "lucide-react";

export function MarketingFooter() {
  return (
    <footer className="border-t bg-card">
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Hand className="h-4 w-4" />
            </div>
            <span className="font-semibold">SignSense</span>
          </Link>
          <p className="mt-3 text-sm text-muted-foreground">
            AI-powered sign language recognition. Built for accessibility.
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Product</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link to="/recognition" className="hover:text-foreground">Recognition</Link></li>
            <li><Link to="/dashboard" className="hover:text-foreground">Dashboard</Link></li>
            <li><Link to="/analytics" className="hover:text-foreground">Analytics</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Account</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link to="/login" className="hover:text-foreground">Sign in</Link></li>
            <li><Link to="/register" className="hover:text-foreground">Create account</Link></li>
            <li><Link to="/feedback" className="hover:text-foreground">Send feedback</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Accessibility</h3>
          <p className="mt-3 text-sm text-muted-foreground">
            Keyboard-navigable, screen-reader friendly, WCAG AA contrast.
          </p>
        </div>
      </div>
      <div className="border-t py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} SignSense. Built with accessibility in mind.
      </div>
    </footer>
  );
}
