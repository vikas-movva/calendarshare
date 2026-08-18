import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import LandingPage from "../pages/LandingPage";

function renderWithProviders(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("LandingPage", () => {
  it("renders the sign-in CTA", () => {
    renderWithProviders(<LandingPage />);
    expect(screen.getByText(/Sign in with Google/i)).toBeInTheDocument();
  });
});