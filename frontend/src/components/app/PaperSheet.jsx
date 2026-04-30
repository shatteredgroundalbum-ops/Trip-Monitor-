import React, { forwardRef } from "react";
import QRCode from "./QRPlaceholder";

/**
 * Pixel-perfect replica of the RTI paper trip sheet for PDF/JPEG export.
 * White bg, black borders, Times/Arial fonts. Fixed width so html2canvas
 * output is identical regardless of the screen.
 */
const PaperSheet = forwardRef(({ session, profile }, ref) => {
  const rows = session.rows || [];
  const expenses = session.road_expenses || [];
  const hasTemp = session.has_temperature;

  const colWidths = hasTemp
    ? ["40px", "70px", "85px", "85px", "1fr", "1fr", "55px", "95px", "70px"]
    : ["40px", "70px", "85px", "85px", "1fr", "1fr", "55px", "105px"];

  const colTemplate = colWidths.join(" ");

  return (
    <div
      ref={ref}
      id="paper-sheet"
      data-testid="paper-sheet"
      style={{
        width: 900,
        padding: 32,
        background: "#FFFFFF",
        color: "#000000",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      {/* Header */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", alignItems: "start" }}>
        {/* Logo */}
        <div>
          <div style={{ fontFamily: "Times New Roman, serif", fontSize: 42, fontWeight: 900, lineHeight: 1, letterSpacing: "-2px" }}>
            <span style={{ color: "#000" }}>≋</span>RTI
          </div>
          <div style={{ fontSize: 10, letterSpacing: "1px", marginTop: 2 }}>
            RIVERSIDE TRANSPORT INC.
          </div>
        </div>
        {/* Title */}
        <div style={{ textAlign: "center", fontFamily: "Times New Roman, serif", fontSize: 30, fontWeight: 700 }}>
          TRIP SHEET
        </div>
        {/* QR */}
        <div style={{ justifySelf: "end", textAlign: "center", border: "1px solid #000", padding: 6 }}>
          <QRCode />
          <div style={{ fontSize: 10, marginTop: 4, lineHeight: 1.2 }}>
            Scan Code to Install<br />Go.Driver to your<br />personal device
          </div>
        </div>
      </div>

      {/* Driver info box */}
      <div style={{ marginTop: 16, width: 280, border: "1px solid #000", borderCollapse: "collapse" }}>
        <InfoRow label="Driver ID" value={session.driver_id} />
        <InfoRow label="Tractor #" value={session.truck_number} />
        <InfoRow label="Order #" value={session.order_number} />
        <InfoRow label="BOL #" value={session.bol_number} last />
      </div>

      {/* Bullets */}
      <ul style={{ marginTop: 20, fontSize: 13, lineHeight: 1.5, paddingLeft: 24 }}>
        <li>All paperwork must be scanned timely using Go.Driver at the end of every trip.</li>
        <li>Staple Paperwork to this Trip Sheet and turn in the next time you are at a terminal.</li>
        <li>To complete your workflow in Go.Driver, a Trip Sheet/Envelope and Bill of Lading – Signed must be scanned.</li>
      </ul>

      {/* Main table */}
      <div style={{ marginTop: 20, border: "1px solid #000" }}>
        <div style={{
          display: "grid", gridTemplateColumns: colTemplate,
          fontSize: 11, fontWeight: 700, background: "#FFF",
        }}>
          <HeaderCell>Seq #</HeaderCell>
          <HeaderCell>Event Code</HeaderCell>
          <HeaderCell>Departure Date</HeaderCell>
          <HeaderCell>Departure Time</HeaderCell>
          <HeaderCell>Customer or Drop Yard Location Name</HeaderCell>
          <HeaderCell>Stop City</HeaderCell>
          <HeaderCell>Stop State</HeaderCell>
          <HeaderCell>Trailer #</HeaderCell>
          {hasTemp && <HeaderCell last>Temp °F</HeaderCell>}
        </div>
        {rows.map((r, i) => (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: colTemplate,
            fontSize: 11, borderTop: "1px solid #000",
          }}>
            <Cell>{r.seq}</Cell>
            <Cell>{r.event_code || ""}</Cell>
            <Cell>{r.departure_date || ""}</Cell>
            <Cell>{r.departure_time || ""}</Cell>
            <Cell>{r.location_name || ""}</Cell>
            <Cell>{r.stop_city || ""}</Cell>
            <Cell>{r.stop_state || ""}</Cell>
            <Cell>{r.trailer_number || ""}</Cell>
            {hasTemp && <Cell last>{r.temperature ?? ""}</Cell>}
          </div>
        ))}
      </div>

      {/* Event codes legend + Road expenses */}
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, marginTop: 16 }}>
        <div style={{ fontSize: 11 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>EVENT CODES</div>
          <div>BBT= Begin Bobtail</div>
          <div>LLD = Live Load</div>
          <div>LUL = Live Unload</div>
          <div>HPL = Hook Pre Loaded Trailer</div>
          <div>BMT = Begin Empty</div>
          <div>HMT = Hook Empty Trailer</div>
          <div>DMT = Drop Empty Trailer</div>
          <div>DLT = Drop Loaded Trailer</div>
          <div>DRL = Final Drop Loaded Trailer</div>
          <div>RTP = Route point</div>
        </div>

        <div>
          <div style={{ border: "1px solid #000" }}>
            <div style={{ textAlign: "center", fontWeight: 700, fontSize: 12, padding: "4px 0", borderBottom: "1px solid #000" }}>
              ROAD EXPENSES &amp; REIMBURSEMENT
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 90px", fontSize: 11, fontWeight: 700 }}>
              <HeaderCell>Date</HeaderCell>
              <HeaderCell>Description</HeaderCell>
              <HeaderCell last>Amount</HeaderCell>
            </div>
            {expenses.map((e, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "90px 1fr 90px",
                fontSize: 11, borderTop: "1px solid #000", minHeight: 22,
              }}>
                <Cell>{e.date || ""}</Cell>
                <Cell>{e.description || ""}</Cell>
                <Cell last>{e.amount || ""}</Cell>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Notes */}
      <div style={{ marginTop: 16, border: "1px solid #000" }}>
        <div style={{ padding: "4px 8px", fontWeight: 700, fontSize: 12, borderBottom: "1px solid #000" }}>NOTES:</div>
        <div style={{ padding: 8, minHeight: 70, fontSize: 11, whiteSpace: "pre-wrap" }}>
          {session.notes || ""}
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 14, fontSize: 10 }}>Ver. 111022 A</div>
    </div>
  );
});

PaperSheet.displayName = "PaperSheet";

function HeaderCell({ children, last }) {
  return (
    <div style={{
      padding: "6px 4px",
      borderRight: last ? "none" : "1px solid #000",
      borderBottom: "1px solid #000",
      textAlign: "center",
    }}>{children}</div>
  );
}
function Cell({ children, last }) {
  return (
    <div style={{
      padding: "4px 6px",
      borderRight: last ? "none" : "1px solid #000",
      minHeight: 22,
    }}>{children}</div>
  );
}
function InfoRow({ label, value, last }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "85px 1fr",
      borderBottom: last ? "none" : "1px solid #000",
      fontSize: 12,
    }}>
      <div style={{ padding: "4px 6px", borderRight: "1px solid #000" }}>{label}</div>
      <div style={{ padding: "4px 6px" }}>{value || ""}</div>
    </div>
  );
}

export default PaperSheet;
