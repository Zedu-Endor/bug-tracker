"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { setWalletAddressAction, type WalletResult } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError, useFieldErrors } from "@/components/ui/field-errors";
import { useToast } from "@/components/ui/toast";

const FORM_ID = "wallet-address";

/**
 * Set the EVM address points could later be sent to (#618).
 *
 * Saving an empty field clears it. Only you can change yours: the server takes
 * the account from the session, not from this form.
 */
export function WalletAddressForm({ initialAddress }: { initialAddress: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();
  const { fieldErrors, show, clear, attrs } = useFieldErrors(FORM_ID, formRef);
  // Controlled, so a finished action doesn't reset the field to its initial
  // value and throw away what the person typed after a failed save.
  const [address, setAddress] = useState(initialAddress);
  const [result, action, pending] = useActionState<WalletResult | undefined, FormData>(
    async (previous, formData) => {
      const next = await setWalletAddressAction(previous, formData);
      if (next.ok) setAddress(next.walletAddress ?? "");
      return next;
    },
    undefined,
  );

  // Show the outcome of each submit exactly once.
  useEffect(() => {
    if (!result) return;
    if (result.ok) {
      clear();
      toast(result.walletAddress ? "Wallet address saved." : "Wallet address cleared.", "success");
    } else {
      show({
        error: result.error ?? "Enter a valid EVM address.",
        field: result.field,
        fieldErrors: result.fieldErrors,
      });
      document.getElementById("walletAddress")?.focus();
    }
  }, [result, show, clear, toast]);

  const trimmed = address.trim();
  const shapeValid = trimmed === "" || /^0x[0-9a-fA-F]{40}$/.test(trimmed);
  const hint = trimmed === ""
    ? "An EVM address (0x followed by 40 hex characters) where your points could be sent one day. Leave it empty and save to clear it."
    : shapeValid
      ? "Looks like a valid EVM address."
      : `That doesn't look right — it should be 0x followed by 40 hex characters (${Math.max(0, trimmed.length - 2)}/40).`;

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-2.5" noValidate>
      <label htmlFor="walletAddress" className="text-[13px] font-bold text-ink">
        Wallet address
      </label>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <Input
          id="walletAddress"
          name="walletAddress"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="0x…"
          autoComplete="off"
          spellCheck={false}
          maxLength={64}
          aria-invalid={!shapeValid}
          className="h-[46px] flex-1 font-mono"
          style={shapeValid ? undefined : { borderColor: "var(--badFg)" }}
          {...attrs("walletAddress")}
        />
        <Button
          type="submit"
          disabled={pending || !shapeValid}
          className="h-[46px] px-5 text-sm font-bold"
        >
          {pending ? "Saving…" : "Save address"}
        </Button>
      </div>
      <FieldError formId={FORM_ID} field="walletAddress" errors={fieldErrors} />
      <p
        className={`text-xs leading-relaxed ${
          trimmed && !shapeValid
            ? "font-bold text-bad-fg"
            : trimmed
              ? "font-bold text-ok-fg"
              : "font-medium text-muted"
        }`}
      >
        {hint}
      </p>
    </form>
  );
}
