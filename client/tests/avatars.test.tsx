import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AvatarPreview } from "../src/ui/avatars/AvatarPreview";
import { FlyerPortrait } from "../src/ui/avatars/FlyerPortrait";
import { TowerPortrait } from "../src/ui/avatars/TowerPortrait";

afterEach(cleanup);

const svg = (container: HTMLElement) => {
  const el = container.querySelector("svg");
  if (!el) throw new Error("no svg");
  return el;
};

describe("Flyer portrait (§F9.8): gender variants match the 3D character", () => {
  it("male: round glasses, no earrings, teal hoodie", () => {
    const { container } = render(<FlyerPortrait gender="male" />);
    const el = svg(container);
    expect(el.getAttribute("data-portrait")).toBe("flyer-male");
    // two glasses rings
    expect(el.querySelectorAll('circle[r="6.2"]')).toHaveLength(2);
    expect(el.querySelectorAll('circle[fill="#F5C518"]')).toHaveLength(0);
    expect(el.innerHTML).toContain("#2EC4B6");
    expect(el.innerHTML).not.toContain("#E07A5F");
  });

  it("female: gold earrings, no glasses, coral bomber", () => {
    const { container } = render(<FlyerPortrait gender="female" />);
    const el = svg(container);
    expect(el.getAttribute("data-portrait")).toBe("flyer-female");
    expect(el.querySelectorAll('circle[r="6.2"]')).toHaveLength(0);
    expect(el.querySelectorAll('circle[fill="#F5C518"]')).toHaveLength(2);
    expect(el.innerHTML).toContain("#E07A5F");
  });

  it("states: idle blinks, talking flaps the mouth, happy closes the eyes into arcs", () => {
    const idle = svg(render(<FlyerPortrait gender="female" />).container);
    expect(idle.getAttribute("data-state")).toBe("idle");
    expect(idle.querySelectorAll("animate")).toHaveLength(2);
    cleanup();
    const talking = svg(render(<FlyerPortrait gender="female" state="talking" />).container);
    expect(talking.querySelector(".animate-mouth")).not.toBeNull();
    cleanup();
    const happy = svg(render(<FlyerPortrait gender="male" state="happy" />).container);
    expect(happy.getAttribute("data-state")).toBe("happy");
    expect(happy.querySelector(".animate-mouth")).toBeNull();
    expect(happy.querySelectorAll("animate")).toHaveLength(0);
  });
});

describe("Tower portrait (§F9.8)", () => {
  it("both genders wear the headset and the teal ATC badge; female has a bun", () => {
    const male = svg(render(<TowerPortrait gender="male" />).container);
    expect(male.getAttribute("data-portrait")).toBe("tower-male");
    expect(male.textContent).toContain("ATC");
    const maleCircles = male.querySelectorAll('circle[r="9"]').length;
    cleanup();
    const female = svg(render(<TowerPortrait gender="female" />).container);
    expect(female.getAttribute("data-portrait")).toBe("tower-female");
    expect(female.textContent).toContain("ATC");
    expect(female.querySelectorAll('circle[r="9"]').length).toBe(maleCircles + 1);
  });

  it("talking lights the mic tip and flaps the mouth", () => {
    const idle = svg(render(<TowerPortrait gender="male" />).container);
    expect(idle.querySelector('circle[fill="#E5484D"]')).toBeNull();
    cleanup();
    const talking = svg(render(<TowerPortrait gender="male" state="talking" />).container);
    expect(talking.querySelector('circle[fill="#E5484D"]')).not.toBeNull();
    expect(talking.querySelector(".animate-mouth")).not.toBeNull();
    expect(talking.querySelector(".animate-boom")).not.toBeNull();
  });
});

describe("AvatarPreview (§F8.2)", () => {
  it("shows a placeholder until a role is picked", () => {
    const { container } = render(<AvatarPreview role={null} gender={null} />);
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("Tower: the animated portrait in the picked gender", () => {
    const { container } = render(<AvatarPreview role="tower" gender="female" />);
    expect(container.querySelector('[data-portrait="tower-female"]')).not.toBeNull();
  });

  it("Flyer without WebGL2 (jsdom): falls back to the 2D portrait", () => {
    const { container } = render(<AvatarPreview role="flyer" gender="male" />);
    expect(container.querySelector('[data-preview="flyer"]')).not.toBeNull();
    expect(container.querySelector('[data-portrait="flyer-male"]')).not.toBeNull();
  });

  it("dims the silhouette until a gender is picked", () => {
    const { container } = render(<AvatarPreview role="tower" gender={null} />);
    expect(container.querySelector('[data-preview="tower"]')?.className).toContain("grayscale");
  });
});
