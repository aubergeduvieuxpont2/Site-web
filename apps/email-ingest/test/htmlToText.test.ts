import { describe, it, expect } from "vitest";
import { htmlToText } from "../src/htmlToText";

describe("htmlToText", () => {
  it("strips tags, keeps block boundaries as newlines", () => {
    const text = htmlToText("<div><p>Code de confirmation</p><p>HM45MDTHZ4</p></div>");
    expect(text).toContain("Code de confirmation\n");
    expect(text).toContain("HM45MDTHZ4");
    expect(text).not.toContain("<");
  });

  it("drops style/script content entirely", () => {
    const text = htmlToText("<style>.a{color:red}</style><script>var x=1;</script><p>Arrivée</p>");
    expect(text).not.toContain("color");
    expect(text).not.toContain("var x");
    expect(text).toContain("Arrivée");
  });

  it("decodes common and numeric entities", () => {
    expect(htmlToText("<p>D&eacute;part &amp; Arriv&#233;e&nbsp;!</p>")).toContain("Départ & Arrivée !");
  });

  it("converts <br> and table cells to line breaks", () => {
    const text = htmlToText("<td>Check-In</td><td>Sep 5, 2026</td><br>next");
    expect(text).toMatch(/Check-In\s*\n/);
    expect(text).toMatch(/Sep 5, 2026\s*\n/);
  });

  it("leaves inherited Object members literal (no prototype fall-through)", () => {
    // &constructor; / &toString; must NOT resolve to Object.prototype members
    // (a function / string) and inject junk — they are not real named entities.
    const out = htmlToText("<p>&constructor; &toString; &hasOwnProperty;</p>");
    expect(out).toBe("&constructor; &toString; &hasOwnProperty;");
    expect(out).not.toContain("function");
    expect(out).not.toContain("[object");
  });
});
