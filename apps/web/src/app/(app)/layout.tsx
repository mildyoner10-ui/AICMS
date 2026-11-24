import GlobalNav from "@/components/GlobalNav";

// Every page in this group is authenticated and shows the navigation rail.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <GlobalNav />
      <div className="min-h-screen md:pl-[248px]">{children}</div>
    </>
  );
}