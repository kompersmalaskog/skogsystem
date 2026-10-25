import { redirect } from "next/navigation";

// Per klass är inte en egen flik längre: den är växeln "Klass" i Ackord
// (samma data ur en annan vinkel). Gamla länkar och bokmärken landar där.
export default function Page() {
  redirect("/ekonomi/mot-ackord?vy=klass");
}
