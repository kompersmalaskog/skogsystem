import Arbetsrapport from "@/components/arbetsrapport/Arbetsrapport";
import type { Viewport } from "next";

export const metadata = {
  title: "Arbetsrapport",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function Page() {
  return <Arbetsrapport />;
}
