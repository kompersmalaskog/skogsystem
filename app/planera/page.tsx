import PlaneraVy from "@/components/planera/PlaneraVy";
import type { Viewport } from "next";

export const metadata = {
  title: "Planera",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function Page() {
  return <PlaneraVy />;
}
