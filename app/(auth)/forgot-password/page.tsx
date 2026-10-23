import Link from "next/link";
import { notFound } from "next/navigation";
import { isPasswordAuthEnabled } from "@/lib/auth-mode";
import { AuthShell } from "@/components/auth-shell";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

/* Distinct browser-tab title; the root layout appends "· Ziki". */
export const metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  if (!isPasswordAuthEnabled()) notFound();

  return (
    <AuthShell
      title="Forgot password"
      description="Enter your email and we'll send a reset link if an account exists."
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className="font-semibold text-accent hover:underline">
            Back to sign in
          </Link>
        </>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
