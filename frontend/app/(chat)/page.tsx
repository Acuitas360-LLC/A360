import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { generateThreadId } from "@/lib/utils";

export default async function Page() {
  // Ensure request context is accessed before random id generation.
  await cookies();
  const id = generateThreadId();
  redirect(`/chat/${id}`);
}
