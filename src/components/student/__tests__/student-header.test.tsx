import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import it_ from "@/messages/it.json";
import { StudentHeader } from "../student-header";

describe("StudentHeader", () => {
  it("shows the student name and a logout button", () => {
    render(
      <NextIntlClientProvider locale="it" messages={it_}>
        <StudentHeader name="Mario Rossi" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Ciao, Mario Rossi")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Esci" })).toBeInTheDocument();
  });
});
