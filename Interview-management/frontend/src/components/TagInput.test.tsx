import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TagInput } from "./TagInput";

describe("TagInput", () => {
  it("commits an in-progress tag when the field loses focus", () => {
    const onChange = vi.fn();
    render(<TagInput label="Technologies" tags={[]} onChange={onChange} />);

    const input = screen.getByPlaceholderText("Add a skill and press Enter");
    fireEvent.change(input, { target: { value: "devOps" } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith(["devOps"]);
  });
});
