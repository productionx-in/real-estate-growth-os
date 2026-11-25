// app/(dashboard)/[orgSlug]/template.tsx — every workspace page enters the same way: it rises into place with a touch
// of depth (.page-enter, app/globals.css). A template re-mounts on each navigation, which is what replays the entrance;
// the shell (sidebar, header) lives in the layout and stays put. Reduced motion makes it instant.
export default function WorkspacePageTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>
}
