"use client";
import { useState, useEffect, useCallback } from "react";
import {
  SorobanRpc,
  Contract,
  Networks,
  TransactionBuilder,
  Account,
  xdr,
  nativeToScVal,
  Address,
} from "@stellar/stellar-sdk";

const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID ?? "";
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://soroban-testnet.stellar.org";
const GRAPHQL_URL = process.env.NEXT_PUBLIC_GRAPHQL_URL ?? "http://localhost:4000/graphql";
const NETWORK = process.env.NEXT_PUBLIC_NETWORK ?? "testnet";
const networkPassphrase = NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;

type ActionResult = { ok: true; txHash: string } | { ok: false; error: string };

async function signAndSubmit(
  publicKey: string,
  method: string,
  args: xdr.ScVal[],
  signWith: (tx: string) => Promise<string>
): Promise<ActionResult> {
  try {
    const server = new SorobanRpc.Server(RPC_URL, { allowHttp: RPC_URL.startsWith("http://") });
    const account = await server.getAccount(publicKey);
    const contract = new Contract(CONTRACT_ID);
    const op = contract.call(method, ...args);
    const tx = new TransactionBuilder(account, { fee: "100", networkPassphrase })
      .addOperation(op)
      .setTimeout(30)
      .build();

    const sim = await server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(sim)) throw new Error(sim.error);

    const prepared = SorobanRpc.assembleTransaction(tx, sim).build();
    const signed = await signWith(prepared.toXDR());
    const result = await server.sendTransaction(
      TransactionBuilder.fromXDR(signed, networkPassphrase) as Parameters<typeof server.sendTransaction>[0]
    );
    return { ok: true, txHash: result.hash };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function freighterSign(txXdr: string): Promise<string> {
  // @ts-expect-error – Freighter injects window.freighter at runtime
  const { signTransaction } = window.freighter;
  if (!signTransaction) throw new Error("Freighter not installed");
  return signTransaction(txXdr, { networkPassphrase });
}

interface GovernanceLogEntry {
  action: string;
  caller: string;
  oldValue?: string;
  newValue?: string;
  timestamp: number;
}

const GOVERNANCE_QUERY = `
  query GovernanceHistory($types: [String!], $limit: Int, $offset: Int) {
    governanceHistory(types: $types, limit: $limit, offset: $offset) {
      action
      caller
      oldValue
      newValue
      timestamp
    }
  }
`;

const ACTION_LABELS: Record<string, string> = {
  transfer_ownership: "Ownership Transfer",
  set_global_max_logs: "Set Global Max",
  set_event_max_logs: "Set Event Max",
  remove_event_cap: "Remove Cap",
  contract_paused: "Paused",
  contract_unpaused: "Unpaused",
  add_owner: "Add Owner",
  remove_owner: "Remove Owner",
  set_required_signatures: "Set Required Sigs",
  submit_proposal: "Proposal Submitted",
  approve_proposal: "Proposal Approved",
  execute_proposal: "Proposal Executed",
  block_submitter: "Block Submitter",
  unblock_submitter: "Unblock Submitter",
  enable_allowlist_mode: "Allowlist Enabled",
  disable_allowlist_mode: "Allowlist Disabled",
};

const TABS = ["Proposals", "Ownership", "Access Control", "Contract Settings", "Activity Log"] as const;
type Tab = (typeof TABS)[number];

export default function GovernanceClient() {
  const [walletKey, setWalletKey] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("Proposals");
  const [activityLog, setActivityLog] = useState<GovernanceLogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(false);

  function showStatus(msg: string, err = false) {
    setStatus(msg);
    setIsError(err);
  }

  async function connectFreighter() {
    try {
      // @ts-expect-error – Freighter injects window.freighter
      const { getPublicKey, isConnected } = window.freighter;
      if (!isConnected) throw new Error("Freighter extension not found");
      const key = await getPublicKey();
      setWalletKey(key);
      showStatus(`Connected: ${key}`);
    } catch (e: unknown) {
      showStatus(e instanceof Error ? e.message : String(e), true);
    }
  }

  async function submit(method: string, args: xdr.ScVal[]) {
    if (!walletKey) { showStatus("Connect your wallet first", true); return; }
    showStatus("Signing and submitting…");
    const result = await signAndSubmit(walletKey, method, args, freighterSign);
    if (result.ok) showStatus(`Submitted: ${result.txHash}`);
    else showStatus(`Error: ${result.error}`, true);
  }

  const [newGlobalMax, setNewGlobalMax] = useState("");
  const [evtType, setEvtType] = useState("");
  const [evtMax, setEvtMax] = useState("");
  const [removeType, setRemoveType] = useState("");
  const [newOwner, setNewOwner] = useState("");

  const callerVal = walletKey
    ? Address.fromString(walletKey).toScVal()
    : xdr.ScVal.scvVoid();

  return (
    <div>
      {/* Wallet connect */}
      <div className="card mb-6">
        <div className="flex-between">
          <div>
            <p style={{ fontWeight: 600, marginBottom: 4 }}>Wallet</p>
            <p className="text-muted text-sm">
              {walletKey ?? "Not connected. Use Freighter browser extension."}
            </p>
          </div>
          <button onClick={connectFreighter} aria-label={walletKey ? "Reconnect wallet" : "Connect Freighter wallet"}>
            {walletKey ? "Reconnect" : "Connect Freighter"}
          </button>
        </div>
        {status && (
          <p
            role={isError ? "alert" : "status"}
            style={{
              marginTop: 12,
              color: isError ? "var(--error)" : "var(--success)",
              fontSize: 13,
              wordBreak: "break-all",
            }}
          >
            {status}
          </p>
        )}
      </div>

      <div className="grid-2 gap-4">
        {/* Set global max */}
        <div className="card">
          <p style={{ fontWeight: 600, marginBottom: 12 }}>Set Global Max Logs</p>
          <label htmlFor="gov-global-max" className="text-muted text-sm" style={{ display: "none" }}>New max</label>
          <input
            id="gov-global-max"
            placeholder="New max (u32)"
            value={newGlobalMax}
            onChange={(e) => setNewGlobalMax(e.target.value)}
            style={{ marginBottom: 12 }}
          />
          <button
            onClick={() =>
              submit("set_global_max_logs", [
                callerVal,
                nativeToScVal(parseInt(newGlobalMax, 10), { type: "u32" }),
              ])
            }
            aria-label="Set global maximum logs"
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "Proposals" && (
        <ProposalsTab callerVal={callerVal} submit={submit} walletKey={walletKey} />
      )}
      {activeTab === "Ownership" && (
        <OwnershipTab callerVal={callerVal} submit={submit} walletKey={walletKey} />
      )}
      {activeTab === "Access Control" && (
        <AccessControlTab callerVal={callerVal} submit={submit} walletKey={walletKey} />
      )}
      {activeTab === "Contract Settings" && (
        <ContractSettingsTab callerVal={callerVal} submit={submit} walletKey={walletKey} />
      )}
      {activeTab === "Activity Log" && (
        <ActivityLogTab
          entries={activityLog}
          loading={logLoading}
          onRefresh={loadActivityLog}
        />
      )}
    </div>
  );
}

function ProposalsTab({
  callerVal,
  submit,
  walletKey,
}: {
  callerVal: xdr.ScVal;
  submit: (m: string, a: xdr.ScVal[]) => Promise<void>;
  walletKey: string | null;
}) {
  const [proposalAction, setProposalAction] = useState<string>("set_global_max_logs");
  const [proposalTtl, setProposalTtl] = useState("100");
  const [proposalTarget, setProposalTarget] = useState("");
  const [proposalValue, setProposalValue] = useState("");

  const ACTIONS = [
    { value: "set_global_max_logs", label: "Set Global Max Logs" },
    { value: "transfer_ownership", label: "Transfer Ownership" },
    { value: "set_required_signatures", label: "Set Required Signatures" },
    { value: "pause", label: "Pause Contract" },
    { value: "unpause", label: "Unpause Contract" },
  ];

  function buildProposalArgs(): xdr.ScVal[] {
    const ttl = nativeToScVal(parseInt(proposalTtl, 10) || 100, { type: "u32" });
    let action: xdr.ScVal;

    switch (proposalAction) {
      case "set_global_max_logs":
        action = xdr.ScVal.scvVec([
          xdr.ScVal.scvSymbol("set_global_max_logs"),
          nativeToScVal(parseInt(proposalValue, 10) || 0, { type: "u32" }),
        ]);
        break;
      case "transfer_ownership":
        action = xdr.ScVal.scvVec([
          xdr.ScVal.scvSymbol("transfer_ownership"),
          Address.fromString(proposalTarget || walletKey || "").toScVal(),
        ]);
        break;
      case "set_required_signatures":
        action = xdr.ScVal.scvVec([
          xdr.ScVal.scvSymbol("set_required_signatures"),
          nativeToScVal(parseInt(proposalValue, 10) || 1, { type: "u32" }),
        ]);
        break;
      case "pause":
        action = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("pause")]);
        break;
      case "unpause":
        action = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("unpause")]);
        break;
      default:
        action = xdr.ScVal.scvVoid();
    }

    return [callerVal, action, ttl];
  }

  return (
    <div>
      <div className="card mb-4">
        <p style={{ fontWeight: 600, marginBottom: 16 }}>Create Proposal</p>
        <p className="text-muted text-sm mb-4">
          Submit a multisig proposal. Other owners must approve before execution.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label className="text-muted text-sm" style={{ display: "block", marginBottom: 4 }}>
              Action
            </label>
            <select
              value={proposalAction}
              onChange={(e) => setProposalAction(e.target.value)}
            >
              {ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>
          {(proposalAction === "transfer_ownership") && (
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="text-muted text-sm" style={{ display: "block", marginBottom: 4 }}>
                Target Address
              </label>
              <input
                placeholder="G... address"
                value={proposalTarget}
                onChange={(e) => setProposalTarget(e.target.value)}
              />
            </div>
          )}
          {(proposalAction === "set_global_max_logs" || proposalAction === "set_required_signatures") && (
            <div>
              <label className="text-muted text-sm" style={{ display: "block", marginBottom: 4 }}>
                Value
              </label>
              <input
                placeholder="Numeric value"
                value={proposalValue}
                onChange={(e) => setProposalValue(e.target.value)}
              />
            </div>
          )}
          <div>
            <label className="text-muted text-sm" style={{ display: "block", marginBottom: 4 }}>
              TTL (ledgers)
            </label>
            <input
              placeholder="100"
              value={proposalTtl}
              onChange={(e) => setProposalTtl(e.target.value)}
            />
          </div>
        </div>
        <button
          style={{ marginTop: 16 }}
          onClick={() => submit("submit_proposal", buildProposalArgs())}
          disabled={!walletKey}
        >
          Submit Proposal
        </button>
      </div>

      <div className="grid-2">
        <div className="card">
          <p style={{ fontWeight: 600, marginBottom: 12 }}>Set Event Type Max Logs</p>
          <label htmlFor="gov-evt-type" className="text-muted text-sm" style={{ display: "none" }}>Event type</label>
          <input
            id="gov-evt-type"
            placeholder="Event type symbol"
            value={evtType}
            onChange={(e) => setEvtType(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          <label htmlFor="gov-evt-max" className="text-muted text-sm" style={{ display: "none" }}>Max</label>
          <input
            id="gov-evt-max"
            placeholder="Max (u32)"
            value={evtMax}
            onChange={(e) => setEvtMax(e.target.value)}
            style={{ marginBottom: 12 }}
          />
          <button
            onClick={() =>
              submit("set_event_max_logs", [
                callerVal,
                xdr.ScVal.scvSymbol(evtType),
                nativeToScVal(parseInt(evtMax, 10), { type: "u32" }),
              ])
            }
            aria-label="Set event type maximum logs"
          >
            Set
          </button>
        </div>

        <div className="card">
          <p style={{ fontWeight: 600, marginBottom: 12 }}>Remove Event Cap</p>
          <label htmlFor="gov-remove-type" className="text-muted text-sm" style={{ display: "none" }}>Event type</label>
          <input
            id="gov-remove-type"
            placeholder="Event type symbol"
            value={removeType}
            onChange={(e) => setRemoveType(e.target.value)}
            style={{ marginBottom: 12 }}
          />
        </div>
      </div>
    </div>
  );
}

function ProposalAction({
  method,
  label,
  callerVal,
  submit,
  walletKey,
  inputPlaceholder,
  inputType,
}: {
  method: string;
  label: string;
  callerVal: xdr.ScVal;
  submit: (m: string, a: xdr.ScVal[]) => Promise<void>;
  walletKey: string | null;
  inputPlaceholder: string;
  inputType: "bytes" | "address";
}) {
  const [input, setInput] = useState("");

  function handleAction() {
    let val: xdr.ScVal;
    if (inputType === "bytes") {
      val = xdr.ScVal.scvBytes(Buffer.from(input, "hex"));
    } else {
      val = Address.fromString(input).toScVal();
    }
    submit(method, [callerVal, val]);
  }

  return (
    <div>
      <input
        placeholder={inputPlaceholder}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        style={{ marginBottom: 12 }}
      />
      <button onClick={handleAction} disabled={!walletKey || !input}>
        {label}
      </button>
    </div>
  );
}

function OwnershipTab({
  callerVal,
  submit,
  walletKey,
}: {
  callerVal: xdr.ScVal;
  submit: (m: string, a: xdr.ScVal[]) => Promise<void>;
  walletKey: string | null;
}) {
  const [newOwner, setNewOwner] = useState("");
  const [removeOwner, setRemoveOwner] = useState("");
  const [requiredSigs, setRequiredSigs] = useState("");

  return (
    <div className="grid-2">
      <div className="card">
        <p style={{ fontWeight: 600, marginBottom: 12 }}>Transfer Ownership</p>
        <p className="text-muted text-sm mb-4">
          Transfer contract ownership to a new address.
        </p>
        <input
          placeholder="New owner address (G…)"
          value={newOwner}
          onChange={(e) => setNewOwner(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        <button
          style={{ background: "var(--warn)", color: "#000" }}
          onClick={() =>
            submit("transfer_ownership", [
              callerVal,
              Address.fromString(newOwner).toScVal(),
            ])
          }
          disabled={!walletKey || !newOwner}
        >
          Transfer Ownership
        </button>
      </div>

      <div className="card">
        <p style={{ fontWeight: 600, marginBottom: 12 }}>Add Owner</p>
        <p className="text-muted text-sm mb-4">
          Add a new owner to the multisig group.
        </p>
        <input
          placeholder="Owner address (G…)"
          value={newOwner}
          onChange={(e) => setNewOwner(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        <button
          onClick={() =>
            submit("add_owner", [
              callerVal,
              Address.fromString(newOwner).toScVal(),
            ])
          }
          disabled={!walletKey || !newOwner}
        >
          Add Owner
        </button>
      </div>

      <div className="card">
        <p style={{ fontWeight: 600, marginBottom: 12 }}>Remove Owner</p>
        <p className="text-muted text-sm mb-4">
          Remove an owner from the multisig group.
        </p>
        <input
          placeholder="Owner address (G…)"
          value={removeOwner}
          onChange={(e) => setRemoveOwner(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        <button
          style={{ background: "var(--error)" }}
          onClick={() =>
            submit("remove_owner", [
              callerVal,
              Address.fromString(removeOwner).toScVal(),
            ])
          }
          disabled={!walletKey || !removeOwner}
        >
          Remove Owner
        </button>
      </div>

      <div className="card">
        <p style={{ fontWeight: 600, marginBottom: 12 }}>Set Required Signatures</p>
        <p className="text-muted text-sm mb-4">
          Change the number of required multisig approvals.
        </p>
        <input
          placeholder="Required count (u32)"
          value={requiredSigs}
          onChange={(e) => setRequiredSigs(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        <button
          onClick={() =>
            submit("set_required_signatures", [
              callerVal,
              nativeToScVal(parseInt(requiredSigs, 10) || 1, { type: "u32" }),
            ])
          }
          disabled={!walletKey || !requiredSigs}
        >
          Set Required Signatures
        </button>
      </div>
    </div>
  );
}

function AccessControlTab({
  callerVal,
  submit,
  walletKey,
}: {
  callerVal: xdr.ScVal;
  submit: (m: string, a: xdr.ScVal[]) => Promise<void>;
  walletKey: string | null;
}) {
  const [blockSubmitter, setBlockSubmitter] = useState("");
  const [allowSubmitter, setAllowSubmitter] = useState("");

  return (
    <div className="grid-2">
      <div className="card">
        <p style={{ fontWeight: 600, marginBottom: 12 }}>Block Submitter</p>
        <p className="text-muted text-sm mb-4">
          Prevent an address from submitting events.
        </p>
        <input
          placeholder="Address to block (G…)"
          value={blockSubmitter}
          onChange={(e) => setBlockSubmitter(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        <button
          style={{ background: "var(--error)" }}
          onClick={() =>
            submit("block_submitter", [
              callerVal,
              Address.fromString(blockSubmitter).toScVal(),
            ])
          }
          disabled={!walletKey || !blockSubmitter}
        >
          Block
        </button>
      </div>

      <div className="card">
        <p style={{ fontWeight: 600, marginBottom: 12 }}>Unblock Submitter</p>
        <p className="text-muted text-sm mb-4">
          Restore an address&apos;s ability to submit events.
        </p>
        <input
          placeholder="Address to unblock (G…)"
          value={blockSubmitter}
          onChange={(e) => setBlockSubmitter(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        <button
          onClick={() =>
            submit("unblock_submitter", [
              callerVal,
              Address.fromString(blockSubmitter).toScVal(),
            ])
          }
          disabled={!walletKey || !blockSubmitter}
        >
          Unblock
        </button>
      </div>

      <div className="card">
        <p style={{ fontWeight: 600, marginBottom: 12 }}>Allow Submitter</p>
        <p className="text-muted text-sm mb-4">
          Add an address to the allowlist (when allowlist mode is enabled).
        </p>
        <input
          placeholder="Address to allow (G…)"
          value={allowSubmitter}
          onChange={(e) => setAllowSubmitter(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        <button
          onClick={() =>
            submit("allow_submitter", [
              callerVal,
              Address.fromString(allowSubmitter).toScVal(),
            ])
          }
          disabled={!walletKey || !allowSubmitter}
        >
          Allow
        </button>
      </div>

      <div className="card">
        <p style={{ fontWeight: 600, marginBottom: 12 }}>Remove from Allowlist</p>
        <p className="text-muted text-sm mb-4">
          Remove an address from the allowlist.
        </p>
        <input
          placeholder="Address to remove (G…)"
          value={allowSubmitter}
          onChange={(e) => setAllowSubmitter(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        <button
          style={{ background: "var(--error)" }}
          onClick={() =>
            submit("remove_submitter_from_allowlist", [
              callerVal,
              Address.fromString(allowSubmitter).toScVal(),
            ])
          }
          disabled={!walletKey || !allowSubmitter}
        >
          Remove
        </button>
      </div>

      <div className="card" style={{ gridColumn: "1 / -1" }}>
        <p style={{ fontWeight: 600, marginBottom: 12 }}>Allowlist Mode</p>
        <p className="text-muted text-sm mb-4">
          Toggle allowlist mode. When enabled, only approved submitters can log events.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() =>
              submit("remove_event_cap", [
                callerVal,
                xdr.ScVal.scvSymbol(removeType),
              ])
            }
            aria-label="Remove event type cap"
          >
            Enable Allowlist
          </button>
          <button
            className="secondary"
            onClick={() => submit("disable_allowlist_mode", [callerVal])}
            disabled={!walletKey}
          >
            Disable Allowlist
          </button>
        </div>
      </div>
    </div>
  );
}

        {/* Transfer ownership */}
        <div className="card">
          <p style={{ fontWeight: 600, marginBottom: 12 }}>Transfer Ownership</p>
          <label htmlFor="gov-new-owner" className="text-muted text-sm" style={{ display: "none" }}>New owner</label>
          <input
            id="gov-new-owner"
            placeholder="New owner address (G…)"
            value={newOwner}
            onChange={(e) => setNewOwner(e.target.value)}
            style={{ marginBottom: 12 }}
          />
          <button
            style={{ background: "var(--warn)", color: "#000" }}
            onClick={() =>
              submit("transfer_ownership", [
                callerVal,
                Address.fromString(newOwner).toScVal(),
              ])
            }
            aria-label="Transfer contract ownership"
          >
            Pause
          </button>
          <button
            onClick={() => submit("unpause", [callerVal])}
            disabled={!walletKey}
          >
            Unpause
          </button>
        </div>
      </div>
    </div>
  );
}

function ActivityLogTab({
  entries,
  loading,
  onRefresh,
}: {
  entries: GovernanceLogEntry[];
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div>
      <div className="flex-between mb-4">
        <p className="text-muted text-sm">Recent governance activity (last 20 actions)</p>
        <button className="secondary" onClick={onRefresh} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="card">
          <p className="text-muted" style={{ textAlign: "center", padding: 32 }}>
            No governance activity recorded yet.
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Caller</th>
                <th>Old</th>
                <th>New</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr key={i}>
                  <td>
                    <span className="badge">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </span>
                  </td>
                  <td className="mono">{entry.caller.slice(0, 16)}…</td>
                  <td className="text-muted">{entry.oldValue ?? "—"}</td>
                  <td>{entry.newValue ?? "—"}</td>
                  <td className="text-muted" style={{ whiteSpace: "nowrap" }}>
                    {new Date(entry.timestamp * 1000).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
