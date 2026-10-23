// @vitest-environment happy-dom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { LeaderboardEntry } from "@/lib/points/leaderboard";

import { LeaderboardTable } from "./leaderboard-table";

const row = (
  rank: number,
  userId: string,
  name: string,
  points: number,
  solvedTasks: number,
): LeaderboardEntry => ({ rank, userId, name, points, solvedTasks, image: null });

const rows = [
  row(1, "u-ada", "Ada Lovelace", 516, 3),
  row(2, "u-bola", "Bola Adeyemi", 396, 5),
  row(3, "u-chi", "Chi Nwosu", 342, 1),
];

afterEach(cleanup);

describe("leaderboard rankings card", () => {
  it("shows the real count, rank, solved count and progress", () => {
    render(
      <LeaderboardTable rows={rows} viewerId="u-bola" total={12} targetPoints={500} />,
    );

    expect(screen.getByText("12 people")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText("Ada Lovelace")).toBeInTheDocument();
    expect(within(items[0]).getByText("3")).toBeInTheDocument();
    expect(within(items[0]).getByText("100%")).toBeInTheDocument();
    expect(within(items[1]).getByText("You")).toBeInTheDocument();
  });

  it("filters by name without a round trip", () => {
    render(
      <LeaderboardTable rows={rows} viewerId="u-ada" total={12} targetPoints={500} />,
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Search people" }), {
      target: { value: "bola" },
    });

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(within(items[0]).getByText("Bola Adeyemi")).toBeInTheDocument();
    expect(screen.getByText("1 of 12 people")).toBeInTheDocument();
  });

  it("says when nobody on the page matches", () => {
    render(
      <LeaderboardTable rows={rows} viewerId="u-ada" total={12} targetPoints={500} />,
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Search people" }), {
      target: { value: "zzz" },
    });

    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText("No one on this page matches “zzz”.")).toBeInTheDocument();
  });

  it("re-sorts by solved tasks while keeping the points ranks", () => {
    render(
      <LeaderboardTable rows={rows} viewerId="u-ada" total={12} targetPoints={500} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Solved" }));

    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByText("Bola Adeyemi")).toBeInTheDocument();
    // Bola is #2 overall even though the table now leads with her.
    expect(within(items[0]).getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Solved" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps server pagination in the card", () => {
    render(
      <LeaderboardTable
        rows={rows}
        viewerId="u-ada"
        total={25}
        targetPoints={500}
        footer={<nav aria-label="Pagination">Page links</nav>}
      />,
    );

    expect(screen.getByRole("navigation", { name: "Pagination" })).toHaveTextContent(
      "Page links",
    );
  });
});
