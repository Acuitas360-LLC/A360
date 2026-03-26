import { redirect } from "next/navigation";
import { generateThreadId } from "@/lib/utils";

export default function Page() {
  const id = generateThreadId();
  redirect(`/chat/${id}`);
}
