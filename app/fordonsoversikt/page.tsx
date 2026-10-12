import { redirect } from "next/navigation";

// Fordonsvyn är ombyggd till /kontroller (resurs/kontroll/händelse-modellen).
// Behåll rutten som redirect så gamla bokmärken/länkar fungerar.
export default function Page() {
  redirect("/kontroller");
}
