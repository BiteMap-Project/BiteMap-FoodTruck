import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../../auth/authState";
import ReviewsSection from "./ReviewsSection";
import RatingBadge from "./RatingBadge";
import { getMyReview, listReviews, saveReview, type CustomerReview, type ReviewPage } from "./reviewsApi";
vi.mock("./reviewsApi", async original => ({
  ...await original<typeof import("./reviewsApi")>(), getMyReview: vi.fn(), listReviews: vi.fn(), saveReview: vi.fn(),
}));
const review: CustomerReview = { id: 1, authorName: "Sam", rating: 5, comment: "Great tacos", version: 0, createdAt: "2026-01-01T12:00:00Z", updatedAt: "2026-01-01T12:00:00Z" };
const empty: ReviewPage = { items: [], page: 0, size: 5, totalElements: 0, totalPages: 0, summary: { averageRating: null, reviewCount: 0 } };
function auth(id: number | null): AuthContextValue {
  return { account: id === null ? null : { id, displayName: "Sam", email: "sam@example.com", roles: ["ROLE_CUSTOMER"] }, status: "ready", error: "",
    refreshAccount: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), activateOperator: vi.fn(), updateProfile: vi.fn() };
}
function open(id: number | null = 7, owner = false) {
  return render(<MemoryRouter><AuthContext.Provider value={auth(id)}>
    <RatingBadge vendorId={9} onProfile /><ReviewsSection vendorId={9} owner={owner} />
  </AuthContext.Provider></MemoryRouter>);
}
beforeEach(()=>{
  vi.clearAllMocks();
  vi.mocked(listReviews).mockResolvedValue(empty);
  vi.mocked(getMyReview).mockResolvedValue({ eligible: true, reason: "", review: null });
  vi.mocked(saveReview).mockResolvedValue(review);
});
it("shows an unrated state and invites guests to sign in", async()=>{
  open(null);
  expect(await screen.findByRole("link",{name:"Sign in to leave a review"})).toBeInTheDocument();
  expect(screen.getByText(/No reviews yet. Reviews come/)).toBeInTheDocument();
  expect(getMyReview).not.toHaveBeenCalled();
});
it("shows why an ineligible customer cannot review",async()=>{
  vi.mocked(getMyReview).mockResolvedValue({eligible:false,reason:"Complete a pickup order from this truck to leave a review.",review:null});
  open();
  expect(await screen.findByText("Complete a pickup order from this truck to leave a review.")).toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"Publish review"})).not.toBeInTheDocument();
});
it("publishes a rating and comment once and refreshes the summary",async()=>{
  open();
  await screen.findByRole("button",{name:"Publish review"});
  fireEvent.click(screen.getByRole("radio",{name:/5 stars/}));
  fireEvent.change(screen.getByLabelText("Your experience"),{target:{value:"Great tacos"}});
  vi.mocked(listReviews).mockResolvedValue({...empty,items:[review],totalElements:1,totalPages:1,summary:{averageRating:5,reviewCount:1}});
  fireEvent.click(screen.getByRole("button",{name:"Publish review"}));
  expect(await screen.findByText("Your review has been saved.")).toBeInTheDocument();
  expect(saveReview).toHaveBeenCalledExactlyOnceWith(9,7,5,"Great tacos",-1);
  expect(await screen.findByText("Great tacos",{selector:"p"})).toBeInTheDocument();
  expect(screen.getAllByText("5.0 / 5 · 1 review").length).toBe(2);
});
it("edits using the loaded review version",async()=>{
  vi.mocked(getMyReview).mockResolvedValue({eligible:true,reason:"",review:{...review,version:3}});
  open();
  fireEvent.click(await screen.findByRole("button",{name:"Update review"}));
  await waitFor(()=>expect(saveReview).toHaveBeenCalledWith(9,7,5,"Great tacos",3));
});
it("requires reload after an uncertain save and focuses the error",async()=>{
  vi.mocked(saveReview).mockRejectedValue(new Error("Connection interrupted."));
  open();
  await screen.findByRole("button",{name:"Publish review"});
  fireEvent.click(screen.getByRole("radio",{name:/5 stars/}));
  fireEvent.change(screen.getByLabelText("Your experience"),{target:{value:"Great tacos"}});
  fireEvent.click(screen.getByRole("button",{name:"Publish review"}));
  const error=await screen.findByRole("alert");
  expect(error).toHaveFocus();
  expect(screen.getByRole("button",{name:"Publish review"})).toBeDisabled();
  expect(screen.getByRole("button",{name:"Reload your review (discard draft)"})).toBeEnabled();
});
it("gives owners a read-only review list and paginates",async()=>{
  vi.mocked(listReviews).mockResolvedValue({...empty,items:[review],totalElements:6,totalPages:2,summary:{averageRating:5,reviewCount:6}});
  open(7,true);
  expect(await screen.findByText("Great tacos")).toBeInTheDocument();
  expect(listReviews).toHaveBeenCalledWith(9,0,true,expect.any(AbortSignal));
  expect(getMyReview).not.toHaveBeenCalled();
  expect(screen.queryByRole("button",{name:"Publish review"})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Next reviews"}));
  await waitFor(()=>expect(listReviews).toHaveBeenCalledWith(9,1,true,expect.any(AbortSignal)));
});
it("renders comments as text, not HTML",async()=>{
  const comment='<img src=x onerror="alert(1)">';
  vi.mocked(listReviews).mockResolvedValue({...empty,items:[{...review,comment}],totalElements:1,totalPages:1});
  const view=open(null);
  expect(await screen.findByText(comment)).toBeInTheDocument();
  expect(view.container.querySelector("img")).toBeNull();
});
it("clears the private draft when accounts change",async()=>{
  const view=open();
  await screen.findByRole("button",{name:"Publish review"});
  fireEvent.change(screen.getByLabelText("Your experience"),{target:{value:"Private unfinished draft"}});
  view.rerender(<MemoryRouter><AuthContext.Provider value={auth(null)}><ReviewsSection vendorId={9}/></AuthContext.Provider></MemoryRouter>);
  expect(screen.queryByDisplayValue("Private unfinished draft")).not.toBeInTheDocument();
  expect(await screen.findByRole("link",{name:"Sign in to leave a review"})).toBeInTheDocument();
});