import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CharacterSelect, type CharacterChoice } from "../src/ui/CharacterSelect";

afterEach(cleanup);

const EMPTY: CharacterChoice = { role: null, gender: null, lang: null, name: "" };
const joinButton = () => screen.getByTestId<HTMLButtonElement>("join");

describe("CharacterSelect (§F8.2)", () => {
  it("keeps Join disabled until role, gender, language and name are set", () => {
    const onJoin = vi.fn();
    render(<CharacterSelect mode="join" initial={EMPTY} takenRoles={[]} onJoin={onJoin} />);
    expect(joinButton().disabled).toBe(true);
    fireEvent.click(screen.getByTestId("role-flyer"));
    expect(joinButton().disabled).toBe(true);
    // gender is never pre-selected
    expect(screen.getByTestId("gender-male").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("gender-female").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByTestId("gender-female"));
    expect(joinButton().disabled).toBe(true);
    fireEvent.click(screen.getByTestId("lang-en"));
    expect(joinButton().disabled).toBe(true);
    fireEvent.change(screen.getByTestId("name"), { target: { value: "   " } });
    expect(joinButton().disabled).toBe(true);
    fireEvent.change(screen.getByTestId("name"), { target: { value: "  Asha " } });
    expect(joinButton().disabled).toBe(false);
    fireEvent.click(joinButton());
    expect(onJoin).toHaveBeenCalledWith({
      name: "Asha",
      role: "flyer",
      lang: "en",
      gender: "female",
    });
  });

  it("disables a taken role", () => {
    render(<CharacterSelect mode="join" initial={EMPTY} takenRoles={["tower"]} />);
    expect(screen.getByTestId<HTMLButtonElement>("role-tower").disabled).toBe(true);
    expect(screen.getByTestId<HTMLButtonElement>("role-flyer").disabled).toBe(false);
  });

  it("prefills from URL params (split view) and joins with the gender", () => {
    const onJoin = vi.fn();
    render(
      <CharacterSelect
        mode="join"
        initial={{ role: "tower", gender: "male", lang: "hi", name: "Tower" }}
        takenRoles={[]}
        onJoin={onJoin}
      />,
    );
    fireEvent.click(joinButton());
    expect(onJoin).toHaveBeenCalledWith({
      name: "Tower",
      role: "tower",
      lang: "hi",
      gender: "male",
    });
  });

  it("sends update_player patches on change in edit mode", () => {
    const onUpdate = vi.fn();
    const onClose = vi.fn();
    render(
      <CharacterSelect
        mode="edit"
        initial={{ role: "flyer", gender: "female", lang: "en", name: "Asha" }}
        takenRoles={["tower"]}
        onUpdate={onUpdate}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId("gender-male"));
    expect(onUpdate).toHaveBeenLastCalledWith({ gender: "male" });
    fireEvent.click(screen.getByTestId("lang-hi"));
    expect(onUpdate).toHaveBeenLastCalledWith({ lang: "hi" });
    fireEvent.change(screen.getByTestId("name"), { target: { value: "Ash" } });
    fireEvent.click(screen.getByTestId("done"));
    expect(onUpdate).toHaveBeenLastCalledWith({ name: "Ash" });
    expect(onClose).toHaveBeenCalled();
  });
});
