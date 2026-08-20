import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  partnerBookingBadgeLabel,
  partnerBookingStamp,
} from "./partner-clinic";

describe("partner-clinic", () => {
  it("stamps booking only for partner role", () => {
    assert.deepEqual(partnerBookingStamp({ role: "admin", name: "Админ" }), {});
    assert.deepEqual(partnerBookingStamp({ role: "partner", name: "Клиника Север" }), {
      bookedByPartner: true,
      partnerClinicName: "Клиника Север",
    });
  });

  it("builds badge from stamp", () => {
    assert.equal(partnerBookingBadgeLabel({ bookedByPartner: false }), null);
    assert.equal(
      partnerBookingBadgeLabel({
        bookedByPartner: true,
        partnerClinicName: "Клиника Север",
      }),
      "Записан: Клиника Север"
    );
    assert.equal(partnerBookingBadgeLabel({ bookedByPartner: true }), "Записан партнёром");
  });
});
