"use client";

import { UsaMapOutline } from "@/components/UsaMapOutline";

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

function arrowPoints(x1: number, y1: number, x2: number, y2: number, size = 12) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const tipX = x2 - Math.cos(angle) * 18;
  const tipY = y2 - Math.sin(angle) * 18;
  const leftX = tipX - size * Math.cos(angle - Math.PI / 6);
  const leftY = tipY - size * Math.sin(angle - Math.PI / 6);
  const rightX = tipX - size * Math.cos(angle + Math.PI / 6);
  const rightY = tipY - size * Math.sin(angle + Math.PI / 6);
  return {
    lineEnd: { x: tipX, y: tipY },
    polygon: `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`,
  };
}

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
      <div className="relative overflow-hidden rounded-xl border border-[var(--card-border)] bg-[#9eb6d1]">
        <svg
          viewBox="0 0 959 593"
          className="block h-auto w-full"
          role="img"
          aria-label="United States map with facilities and customers"
        >
          <defs>
            <filter id="markerShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodOpacity="0.25" />
            </filter>
          </defs>

          <rect width="959" height="593" fill="#9eb6d1" />
          <UsaMapOutline />

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
                  strokeWidth="2.5"
                  strokeDasharray="7 5"
                  opacity="0.85"
                />
                <polygon points={arrow.polygon} fill="#1e3a5f" />
              </g>
            );
          })}

          {customers.map((c) => (
            <g key={c.id} transform={`translate(${c.map_x} ${c.map_y})`}>
              <circle r="11" fill="#fff7ed" stroke="#c2410c" strokeWidth="3" filter="url(#markerShadow)" />
              <circle r="3.5" fill="#c2410c" />
              <text x="14" y="-6" fontSize="14" fontWeight="700" fill="#9a3412">
                {c.id}
              </text>
              <text x="14" y="10" fontSize="12" fill="#7c2d12">
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
                  x="-14"
                  y="-14"
                  width="28"
                  height="28"
                  rx="5"
                  fill={isSelected ? "#1e3a5f" : "#eff6ff"}
                  stroke="#1e3a5f"
                  strokeWidth="3"
                  filter="url(#markerShadow)"
                />
                <text
                  x="0"
                  y="5"
                  textAnchor="middle"
                  fontSize="13"
                  fontWeight="800"
                  fill={isSelected ? "#fff" : "#1e3a5f"}
                >
                  {f.id}
                </text>
                <text x="18" y="-4" fontSize="13" fontWeight="700" fill="#1e3a5f">
                  {f.name}
                </text>
                <text x="18" y="12" fontSize="11" fill="#475569">
                  {f.city}
                </text>
              </g>
            );
          })}
        </svg>

        {selected.size === 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-max rounded border border-[var(--card-border)] bg-white/95 px-3 py-1.5 text-xs text-[var(--slate)] shadow-sm">
            Select facilities — navy arrows show which customers each hub serves
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
