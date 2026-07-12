import type { Metadata } from "next";
import BluetoothDrawPage from "@/components/BluetoothDrawPage";
import "./draw.css";

export const metadata: Metadata = {
  title: "SLVR | Draw Bluetooth Icon",
  description: "Pixel editor for the iPod status bar Bluetooth symbol.",
};

export default function DrawPage() {
  return <BluetoothDrawPage />;
}
