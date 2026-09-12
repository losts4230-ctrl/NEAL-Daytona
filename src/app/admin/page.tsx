"use client";

import { useCallback, useState } from "react";
import { formatMoney } from "@/lib/domain/money";
import type { AdminBid } from "@/lib/http/serialise";

/**
 * Operator console.
 *
 * The admin token is held in React state only — never localStorage, never
 * sessionStorage, never a non-HttpOnly cookie. It costs a re-entry on reload and
 * removes the token from anything a cross-site script could read. The real
 * control is server-side on every /api/v1/admin route; this page is only a
 * client for it.
 *
 * Launch scope: one shared token, no per-user identity, no audit of who acted.
 * See the authorisation section of docs/ARCHITECTURE.md before a second person
 * is given access.
 */

interface Pagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

const STATUS_FILTERS = ["", "active", "outbid", "accepted", "rejected"] as const;

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [bids, setBids] = useState<AdminBid[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const money = (minor: number) => formatMoney(minor, { currency: "GBP", locale: "en-GB" });

  const load = useCallback(
    async (bearer: string, status: string) => {
      setBusy(true);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: "100" });
        if (status) params.set("status", status);

        const response = await fetch(`/api/v1/admin/bids?${params}`, {
          headers: { authorization: `Bearer ${bearer}` },
          cache: "no-store",
        });

        if (response.status === 401) {
          setError("That token was rejected.");
          setAuthenticated(false);
          return;
        }
        if (!response.ok) {
          setError(`Request failed with status ${response.status}.`);
          return;
        }

        const body = (await response.json()) as { data: { bids: AdminBid[]; pagination: Pagination } };
        setBids(body.data.bids);
        setPagination(body.data.pagination);
        setAuthenticated(true);
      } catch {
        setError("Could not reach the server.");
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const decide = useCallback(
    async (bidId: string, status: "accepted" | "rejected") => {
      setBusy(true);
      setError(null);
      try {
        const response = await fetch(`/api/v1/admin/bids/${bidId}`, {
          method: "PATCH",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ status }),
        });
        if (!response.ok) {
          setError(`Could not update that bid (status ${response.status}).`);
          return;
        }
        await load(token, statusFilter);
      } catch {
        setError("Could not reach the server.");
      } finally {
        setBusy(false);
      }
    },
    [token, statusFilter, load],
  );

  if (!authenticated) {
    return (
      <div className="wrap admin" style={{ maxWidth: "26rem" }}>
        <p className="eyebrow">
          <span className="eyebrow__index">&#9737;</span> Operator
        </p>
        <h1 style={{ fontSize: "1.6rem", textTransform: "uppercase" }}>Admin console</h1>
        <form
          style={{ marginTop: "2rem" }}
          onSubmit={(event) => {
            event.preventDefault();
            void load(token, statusFilter);
          }}
        >
          <div className="field">
            <label className="field__label" htmlFor="admin-token">
              Admin API token
            </label>
            <input
              id="admin-token"
              className="input"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              required
            />
            <p className="field__hint">
              Held in memory for this tab only. Re-enter after a reload.
            </p>
          </div>
          {error ? (
            <p className="formerror" role="alert" style={{ marginBottom: "1rem" }}>
              {error}
            </p>
          ) : null}
          <button className="btn btn--primary btn--block" type="submit" disabled={busy || !token}>
            {busy ? "Checking..." : "Sign in"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="wrap admin">
      <p className="eyebrow">
        <span className="eyebrow__index">&#9737;</span> Operator
      </p>
      <h1 style={{ fontSize: "1.6rem", textTransform: "uppercase" }}>
        Bids{pagination ? ` (${pagination.total})` : ""}
      </h1>

      <div className="filters" style={{ marginTop: "1.5rem" }}>
        {STATUS_FILTERS.map((status) => (
          <button
            key={status || "all"}
            type="button"
            className="chip"
            aria-pressed={statusFilter === status}
            onClick={() => {
              setStatusFilter(status);
              void load(token, status);
            }}
          >
            {status || "all"}
          </button>
        ))}
        <span className="filters__spacer" />
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => void load(token, statusFilter)}
          disabled={busy}
        >
          {busy ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error ? (
        <p className="formerror" role="alert" style={{ marginBottom: "1rem" }}>
          {error}
        </p>
      ) : null}

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Placed</th>
              <th scope="col">Lot</th>
              <th scope="col">Amount</th>
              <th scope="col">Public name</th>
              <th scope="col">Contact</th>
              <th scope="col">Status</th>
              <th scope="col">Decide</th>
            </tr>
          </thead>
          <tbody>
            {bids.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ color: "var(--text-faint)" }}>
                  No bids match this filter.
                </td>
              </tr>
            ) : (
              bids.map((bid) => (
                <tr key={bid.id}>
                  <td className="num">{bid.createdAt.replace("T", " ").slice(0, 16)}</td>
                  <td>{bid.panelId}</td>
                  <td className="num">{money(bid.amountMinor)}</td>
                  <td>{bid.displayName}</td>
                  <td>
                    {bid.contactName}
                    <br />
                    <a href={`mailto:${bid.contactEmail}`} style={{ color: "var(--text-dim)" }}>
                      {bid.contactEmail}
                    </a>
                    {bid.contactPhone ? (
                      <>
                        <br />
                        <span style={{ color: "var(--text-faint)" }}>{bid.contactPhone}</span>
                      </>
                    ) : null}
                  </td>
                  <td>{bid.status}</td>
                  <td>
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      <button
                        type="button"
                        className="btn btn--sm"
                        disabled={busy || bid.status === "accepted"}
                        onClick={() => void decide(bid.id, "accepted")}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="btn btn--sm"
                        disabled={busy || bid.status === "rejected"}
                        onClick={() => void decide(bid.id, "rejected")}
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
