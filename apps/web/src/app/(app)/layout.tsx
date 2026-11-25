import { ThemeProvider } from "@/app/ThemeProvider";
import GlobalNav from "@/components/GlobalNav";

// Every page in this group is authenticated and shows the navigation rail.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <GlobalNav />
      <div className="app-content">{children}</div>
    </ThemeProvider>
  );
}
