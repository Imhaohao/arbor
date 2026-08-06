"use client";

import {
  LayoutGridIcon,
  ListChecksIcon,
  UsersIcon,
  HistoryIcon,
  MessagesSquareIcon,
  BookOpenIcon,
} from "lucide-react";
import { ArborMark } from "@/components/ui/ArborMark";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar-primitive";
import { NavUser } from "@/components/ui/nav-user";

type SidebarNavItem = {
  title: string;
  url: string;
  icon: React.ReactNode;
  isActive?: boolean;
};

type SidebarNavGroup = {
  label?: string;
  items: SidebarNavItem[];
};

// Auctions/Credits/Analytics/Settings had no dedicated destinations (they
// all pointed back at /dashboard as placeholder nav) and were removed rather
// than left as dead-looking-live links — see todo.md's 2026-08-03 audit.
const navGroups: SidebarNavGroup[] = [
  {
    label: "Marketplace",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: <LayoutGridIcon />, isActive: true },
      { title: "Tasks", url: "/tasks", icon: <ListChecksIcon /> },
      { title: "Specialists", url: "/agents", icon: <UsersIcon /> },
      { title: "Replays", url: "/replay", icon: <HistoryIcon /> },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "A2A console", url: "/admin", icon: <MessagesSquareIcon /> },
    ],
  },
];

// Feedback/Help Center were bare `href="#"` with no real destination and
// were removed for the same reason (see comment above).
const footerNavLinks: SidebarNavItem[] = [
  { title: "Documentation", url: "/api/openapi.json", icon: <BookOpenIcon /> },
];

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon" variant="sidebar" className="dark">
      <SidebarHeader className="relative h-14 justify-center px-2 py-0">
        <div className="flex h-10 items-center rounded-lg px-2 group-data-[state=collapsed]/sidebar:[&_.font-display]:hidden">
          <ArborMark as="link" tone="light" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((group, index) => (
          <SidebarGroup key={`sidebar-group-${index}`}>
            {group.label && (
              <SidebarGroupLabel className="font-normal">
                {group.label}
              </SidebarGroupLabel>
            )}
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={item.isActive}
                    tooltip={item.title}
                  >
                    <a href={item.url}>
                      {item.icon}
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="gap-0 p-0">
        <SidebarMenu className="border-t border-sidebar-border p-2">
          {footerNavLinks.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                asChild
                className="text-sidebar-foreground/70"
                size="sm"
              >
                <a href={item.url}>
                  {item.icon}
                  <span>{item.title}</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}

export default AppSidebar;
