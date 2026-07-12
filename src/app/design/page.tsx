import type { Metadata } from "next";
import IpodDesignPage from "@/components/IpodDesignPage";
import "./design.css";

export const metadata: Metadata = {
  title: "SLVR | iPod Design",
  description: "Live editor for iPod face curvature and body geometry.",
};

export default function DesignRoutePage() {
  return <IpodDesignPage />;
}
