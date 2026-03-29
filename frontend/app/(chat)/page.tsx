import { redirect } from "next/navigation";
import { generateThreadId } from "@/lib/utils";

export default async function Page() {
  const id = generateThreadId();
  redirect(`/chat/${id}`);
}
