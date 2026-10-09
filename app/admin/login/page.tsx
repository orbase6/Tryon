import { LoginForm } from "@/components/admin/LoginForm";
export const metadata = { title: "Admin login" };
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return <LoginForm next={(await searchParams).next} />;
}
