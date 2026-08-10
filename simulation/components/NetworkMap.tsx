"use client";

interface MapFacility {
  id: string;
  name: string;
  city: string;
  map_x: number;
  map_y: number;
  fixed_cost_to_open: number;
}

interface MapCustomer {
  id: string;
  name: string;
  city: string;
  map_x: number;
  map_y: number;
  weekly_demand: number;
}

function arrowPoints(x1: number, y1: number, x2: number, y2: number, size = 1.7) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const tipX = x2 - Math.cos(angle) * 3.0;
  const tipY = y2 - Math.sin(angle) * 3.0;
  const leftX = tipX - size * Math.cos(angle - Math.PI / 6);
  const leftY = tipY - size * Math.sin(angle - Math.PI / 6);
  const rightX = tipX - size * Math.cos(angle + Math.PI / 6);
  const rightY = tipY - size * Math.sin(angle + Math.PI / 6);
  return {
    lineEnd: { x: tipX, y: tipY },
    polygon: `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`,
  };
}

/** Contiguous USA outline in the same 0–100 map coordinate space as facility/customer markers. */
const USA_PATH =
  "M 8.5 38 L 11 24 L 18 18 L 24 14 L 31 12.5 L 38 14 L 44 13 L 50 15 L 56 14 L 62 16 L 68 15 L 74 17 L 79 20 L 84 24 L 88 29 L 90.5 35 L 91 41 L 89.5 47 L 90 53 L 87.5 58 L 84 63 L 81 68 L 77 73 L 74 78 L 69 80 L 63 81.5 L 57 83 L 51 81 L 45 82 L 39 80 L 34 78 L 29 74 L 24 71 L 19 66 L 15 60 L 12 54 L 9.5 48 L 8.2 43 Z";

export function NetworkMap({
  facilities,
  customers,
  transportCosts,
  selected,
  onToggle,
}: {
  facilities: MapFacility[];
  customers: MapCustomer[];
  transportCosts: Record<string, Record<string, number>>;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const assignments = customers.map((customer) => {
    const selectedFacilities = facilities.filter((f) => selected.has(f.id));
    const facility = [...selectedFacilities].sort((a, b) => {
      const costDiff = transportCosts[a.id][customer.id] - transportCosts[b.id][customer.id];
      if (costDiff !== 0) return costDiff;
      return a.id.localeCompare(b.id);
    })[0];
    return { customer, facility };
  });

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border border-[var(--card-border)] bg-[#e8eef5]">
        <svg viewBox="0 0 100 92" className="block h-auto w-full" role="img" aria-label="United States facility and customer map">
          <defs>
            <linearGradient id="usaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="100%" stopColor="#e2e8f0" />
            </linearGradient>
            <filter id="markerShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0.7" stdDeviation="0.7" floodOpacity="0.2" />
            </filter>
          </defs>

          <rect width="100" height="92" fill="#dbe4ef" />
          <path d={USA_PATH} fill="url(#usaFill)" stroke="#94a3b8" strokeWidth="0.7" />
          {/* light state-ish dividers */}
          <path
            d="M26 14 L27 72 M48 14 L45 81 M67 16 L66 80 M12 54 L89 47"
            stroke="#cbd5e1"
            strokeWidth="0.35"
            opacity="0.7"
          />

          {assignments.map(({ customer, facility }) => {
            if (!facility) return null;
            const arrow = arrowPoints(facility.map_x, facility.map_y, customer.map_x, customer.map_y);
            return (
              <g key={`${facility.id}-${customer.id}`} className="map-assignment-flow">
                <line
                  x1={facility.map_x}
                  y1={facility.map_y}
                  x2={arrow.lineEnd.x}
                  y2={arrow.lineEnd.y}
                  stroke="#1e3a5f"
                  strokeWidth="0.55"
                  strokeDasharray="1.5 1.2"
                  opacity="0.7"
                />
                <polygon points={arrow.polygon} fill="#1e3a5f" opacity="0.85" />
              </g>
            );
          })}

          {customers.map((c) => (
            <g key={c.id} transform={`translate(${c.map_x} ${c.map_y})`}>
              <circle r="2.3" fill="#fff7ed" stroke="#c2410c" strokeWidth="0.9" filter="url(#markerShadow)" />
              <circle r="0.7" fill="#c2410c" />
              <text x="3.1" y="-1" fontSize="2.55" fontWeight="700" fill="#9a3412">
                {c.id}
              </text>
              <text x="3.1" y="2" fontSize="1.95" fill="#7c2d12">
                {c.city.split(",")[0]}
              </text>
            </g>
          ))}

          {facilities.map((f) => {
            const isSelected = selected.has(f.id);
            return (
              <g
                key={f.id}
                transform={`translate(${f.map_x} ${f.map_y})`}
                onClick={() => onToggle(f.id)}
                className="cursor-pointer"
                role="button"
                aria-label={`${isSelected ? "Close" : "Open"} facility ${f.id}`}
              >
                <rect
                  x="-2.9"
                  y="-2.9"
                  width="5.8"
                  height="5.8"
                  rx="1.1"
                  fill={isSelected ? "#1e3a5f" : "#eff6ff"}
                  stroke="#1e3a5f"
                  strokeWidth="0.9"
                  filter="url(#markerShadow)"
                />
                <text x="0" y="1" textAnchor="middle" fontSize="2.45" fontWeight="800" fill={isSelected ? "#fff" : "#1e3a5f"}>
                  {f.id}
                </text>
                <text x="3.7" y="-0.5" fontSize="2.2" fontWeight="700" fill="#1e3a5f">
                  {f.name}
                </text>
                <text x="3.7" y="2" fontSize="1.85" fill="#475569">
                  {f.city}
                </text>
              </g>
            );
          })}
        </svg>

        {selected.size === 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-max rounded border border-[var(--card-border)] bg-white/95 px-3 py-1.5 text-xs text-[var(--slate)] shadow-sm">
            Select facilities to preview navy service arrows to customers
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-[var(--slate)]">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-[var(--navy)]" /> Open facility
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-[var(--navy)] bg-[#eff6ff]" /> Candidate facility
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-[#c2410c] bg-[#fff7ed]" /> Customer
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-0.5 text-[var(--navy)]">
            <span className="w-4 border-t border-dashed border-[var(--navy)]" />
            <span className="text-[9px] leading-none">▶</span>
          </span>
          Serves customer
        </span>
      </div>
    </div>
  );
}
