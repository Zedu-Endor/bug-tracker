import { describe, expect, it, vi } from "vitest";

const requireUser = vi.hoisted(() => vi.fn());
const cookieSet = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: cookieSet }) }));
vi.mock("@/lib/auth-helpers", () => ({ requireUser }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { update: vi.fn() } } }));

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { setThemeAction, setGuestThemeAction } from "./settings";

describe("setThemeAction (#277)", () => {
  it("saves the choice on the account and in this device's cookie", async () => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "u1", role: "user" });
    expect(await setThemeAction("dark")).toEqual({ ok: true });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { theme: "dark" } });
    expect(cookieSet).toHaveBeenCalledWith("theme", "dark", expect.objectContaining({ path: "/", httpOnly: true }));
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("rejects anything but system, light or dark", async () => {
    vi.clearAllMocks();
    expect(await setThemeAction("purple")).toEqual({ error: "Invalid setting" });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
  });
});

describe("setGuestThemeAction", () => {
  it("stores the choice in the cookie without touching an account", async () => {
    vi.clearAllMocks();
    expect(await setGuestThemeAction("light")).toEqual({ ok: true });
    expect(cookieSet).toHaveBeenCalledWith(
      "theme",
      "light",
      expect.objectContaining({ path: "/", httpOnly: true }),
    );
    expect(requireUser).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects an unknown theme", async () => {
    vi.clearAllMocks();
    expect(await setGuestThemeAction("sepia")).toEqual({ error: "Invalid setting" });
    expect(cookieSet).not.toHaveBeenCalled();
  });
});
