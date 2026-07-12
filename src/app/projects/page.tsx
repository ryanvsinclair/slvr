import type { Metadata } from "next";
import ProjectsRoom from "@/components/ProjectsRoom";
import "./projects.css";

export const metadata: Metadata = {
  title: "SLVR | Work",
  description:
    "Browse real client projects in our interactive projector room.",
};

export default function ProjectsPage() {
  return <ProjectsRoom />;
}
