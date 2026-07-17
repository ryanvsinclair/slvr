import type { Metadata, Viewport } from "next";
import ProjectsRoom from "@/components/ProjectsRoom";
import "./projects.css";

export const metadata: Metadata = {
  title: "SLVR | Work",
  description:
    "Browse real client projects in our interactive projector room.",
  appleWebApp: {
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function ProjectsPage() {
  return <ProjectsRoom />;
}
