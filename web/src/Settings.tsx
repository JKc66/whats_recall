import {
  createSignal,
  createMemo,
  createResource,
  Show,
  onCleanup,
  createEffect,
} from "solid-js";
import {
  fetchWhatsAppChats,
  fetchMonitored,
  addMonitored,
  removeMonitored,
  clearData,
  fetchSettings,
  updateSetting,
  fetchPairingStatus,
  resetWhatsApp,
} from "./api";
import {
  stats,
  setStats,
  setView,
  setChats,
  setMessages,
  setCurrentChatId,
} from "./store";
import { notify } from "./notify";
import type { WhatsAppChat } from "./types";
import SettingsHeader from "./components/settings/SettingsHeader";
import ConfigPanel from "./components/settings/ConfigPanel";
import ChatSelector from "./components/settings/ChatSelector";
import DangerZone from "./components/settings/DangerZone";

export default function Settings() {
  const [search, setSearch] = createSignal("");
  const [tab, setTab] = createSignal<"monitored" | "available" | "config">(
    "config",
  );
  // eslint-disable-next-line no-unassigned-vars
  let scrollContainer: HTMLDivElement | undefined;

  createEffect(() => {
    tab(); // Track tab change
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
    }
  });

  const [monitored, { refetch: refetchMonitored }] =
    createResource(fetchMonitored);
  
  const [available, { refetch: refetchAvailableResource }] = createResource(() => fetchWhatsAppChats(false));

  const refetchAvailable = async () => {
    await fetchWhatsAppChats(true); // Force sync on server
    refetchAvailableResource();     // Reload resource
  };

  const [busy, setBusy] = createSignal<string | null>(null);
  const [confirmClear, setConfirmClear] = createSignal(false);
  const [clearing, setClearing] = createSignal(false);
  const [clearPassword, setClearPassword] = createSignal("");

  const [config, { refetch: refetchConfig }] = createResource(fetchSettings);
  const [savingConfig, setSavingConfig] = createSignal<string | null>(null);
  const [pairing, { refetch: refetchPairing, mutate: mutatePairing }] =
    createResource(fetchPairingStatus);
  const [showResetNotice, setShowResetNotice] = createSignal(false);
  const [isWaitingForPairing, setIsWaitingForPairing] = createSignal(false);
  const [sortBy, setSortBy] = createSignal<"recent" | "name">("recent");
  const [filterType, setFilterType] = createSignal<
    "all" | "contacts" | "chats" | "groups"
  >("all");


  const isConnected = createMemo(() => stats().connected);
  createEffect(() => {
    if (isConnected()) {
      refetchAvailable();
      refetchMonitored();
    }
  });

  onCleanup(() => clearInterval(pairingInterval));
  const pairingInterval = setInterval(() => {
    if (
      tab() === "config" &&
      !stats().connected &&
      !showResetNotice() &&
      (isWaitingForPairing() || pairing()?.data)
    ) {
      refetchPairing();
    }
  }, 5000);

  const monitoredIds = createMemo(
    () => new Set((monitored() || []).map((m) => m.chat_id)),
  );

  const filteredAvailable = createMemo(() => {
    const q = search().toLowerCase().trim();
    let list = [...(available() || [])];
    
    // 2. Apply Category Filter (Tabs)
    if (filterType() === "contacts") {
      list = list.filter((c: any) => c.category === "contact");
    } else if (filterType() === "chats") {
      list = list.filter((c: any) => c.category === "chat");
    } else if (filterType() === "groups") {
      list = list.filter((c: any) => c.category === "group");
    }

    // 3. Apply Search Filter
    if (q) {
      list = list.filter(
        (c: any) => 
          (c.name && c.name.toLowerCase().includes(q)) || 
          (c.id && c.id.toLowerCase().includes(q))
      );
    }
    
    if (sortBy() === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    else list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    return list;
  });

  const filteredMonitored = createMemo(() => {
    const q = search().toLowerCase().trim();
    let list = monitored() || [];
    if (q)
      list = list.filter(
        (c) => c.name.toLowerCase().includes(q) || c.chat_id.includes(q),
      );
    return list;
  });

  async function handleAdd(chat: WhatsAppChat) {
    setBusy(chat.id);
    try {
      await addMonitored(chat.id, chat.name, !!chat.isGroup);
      refetchMonitored();
      refetchAvailable();
    } finally {
      setBusy(null);
    }
  }

  async function handleRemove(chatId: string) {
    setBusy(chatId);
    try {
      await removeMonitored(chatId);
      refetchMonitored();
      refetchAvailable();
    } finally {
      setBusy(null);
    }
  }

  async function confirmClearData() {
    if (!clearPassword()) {
      notify.warning("Password required", "Enter your password to confirm.");
      return;
    }
    setClearing(true);
    setConfirmClear(false);
    try {
      await clearData(clearPassword());
      setChats([]);
      setMessages([]);
      setCurrentChatId(null);
      setStats((s) => ({
        ...s,
        totalMessages: 0,
        deletedMessages: 0,
        totalChats: 0,
      }));
      notify.success(
        "Data cleared",
        "All messages and chat data have been deleted.",
      );
    } catch {
      notify.warning("Failed to clear data", "Wrong password or error.");
    } finally {
      setClearing(false);
      setClearPassword("");
    }
  }

  async function handleConfigUpdate(key: string, value: string) {
    if (config() && config()![key] === value) return;
    setSavingConfig(key);
    try {
      await updateSetting(key, value);
      await refetchConfig();
      if (key === "whatsapp_notify")
        setStats((s) => ({ ...s, notifyEnabled: value === "true" }));
      if (key === "whatsapp_phone" || key === "whatsapp_pairing_method") {
        setShowResetNotice(true);
        setIsWaitingForPairing(false);
        mutatePairing({
          type: null,
          data: null,
          connected: false,
          authenticated: false,
        } as any);
      }
      notify.success("Setting saved", `${key.replace(/_/g, " ")} updated.`);
    } catch {
      notify.warning("Save failed", "Something went wrong.");
    } finally {
      setSavingConfig(null);
    }
  }

  async function handleReset() {
    const logoutOnly = !!pairing()?.authenticated && !showResetNotice();
    if (pairing()?.authenticated || pairing()?.data) {
      if (
        !confirm(
          "Are you sure you want to reset/terminate the current WhatsApp session?",
        )
      )
        return;
    }
    setBusy("reset_wa");
    try {
      await resetWhatsApp(!logoutOnly);
      await refetchPairing();
      setShowResetNotice(false);
      setIsWaitingForPairing(!logoutOnly);
      notify.success(
        logoutOnly ? "Logged out" : "Session reset",
        logoutOnly
          ? "Successfully terminated."
          : "Waiting for pairing credentials...",
      );
    } catch {
      notify.warning("Reset failed", "Could not reset session.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div class="flex-1 flex flex-col h-full bg-bg relative overflow-hidden">
      <SettingsHeader
        onBack={() => setView("chats")}
        search={search()}
        onSearchChange={setSearch}
        stats={stats()}
        showSearch={tab() !== "config"}
      />

      <div class="flex items-stretch overflow-x-auto scrollbar-hide border-b border-border bg-surface relative z-10 min-h-14">
        <button
          class="px-4 md:px-8 py-3 md:py-4 text-[9px] md:text-[11px] font-mono font-bold transition-all shrink-0 border-r border-border uppercase tracking-[0.15em]"
          classList={{
            "bg-text-display text-black": tab() === "config",
            "text-text-disabled hover:text-text-primary hover:bg-surface-raised/50": tab() !== "config",
          }}
          onClick={() => setTab("config")}
        >
          {tab() === "config" ? "[ CONFIG ]" : "CONFIG"}
        </button>
        <button
          class="px-4 md:px-8 py-3 md:py-4 text-[9px] md:text-[11px] font-mono font-bold transition-all shrink-0 border-r border-border uppercase tracking-[0.15em]"
          classList={{
            "bg-text-display text-black": tab() === "monitored",
            "text-text-disabled hover:text-text-primary hover:bg-surface-raised/50": tab() !== "monitored",
          }}
          onClick={() => setTab("monitored")}
        >
          {tab() === "monitored" ? `[ MON: ${filteredMonitored().length} ]` : `MON: ${filteredMonitored().length}`}
        </button>
        <button
          class="px-4 md:px-8 py-3 md:py-4 text-[9px] md:text-[11px] font-mono font-bold transition-all shrink-0 border-r border-border uppercase tracking-[0.15em]"
          classList={{
            "bg-text-display text-black": tab() === "available",
            "text-text-disabled hover:text-text-primary hover:bg-surface-raised/50": tab() !== "available",
          }}
          onClick={() => setTab("available")}
        >
          {tab() === "available" ? `[ AVAIL: ${filteredAvailable().length} ]` : `AVAIL: ${filteredAvailable().length}`}
        </button>
      </div>


      <div 
        ref={scrollContainer}
        class="flex-1 overflow-y-auto scrollbar-thin relative z-10"
      >
        <Show when={tab() === "config"}>
          <ConfigPanel
            pairing={pairing()}
            config={config()}
            busy={busy()}
            savingConfig={savingConfig()}
            showResetNotice={showResetNotice()}
            isWaitingForPairing={isWaitingForPairing()}
            stats={stats()}
            onConfigUpdate={handleConfigUpdate}
            onReset={handleReset}
            onToggleNotify={() =>
              handleConfigUpdate(
                "whatsapp_notify",
                config()?.whatsapp_notify === "true" ? "false" : "true",
              )
            }
          />
          <DangerZone
            clearing={clearing()}
            confirmClear={confirmClear()}
            clearPassword={clearPassword()}
            onClearData={() => {
              setClearPassword("");
              setConfirmClear(true);
            }}
            onConfirmClearData={confirmClearData}
            onSetClearPassword={setClearPassword}
            onCancelClear={() => setConfirmClear(false)}
          />
        </Show>

        <Show when={tab() === "monitored"}>
          <ChatSelector
            type="monitored"
            chats={filteredMonitored()}
            loading={monitored.loading}
            busy={busy()}
            onRemove={handleRemove}
            filterType={filterType()}
            setFilterType={setFilterType}
            sortBy={sortBy()}
            setSortBy={setSortBy}
          />
        </Show>

        <Show when={tab() === "available"}>
          <ChatSelector
            type="available"
            chats={filteredAvailable()}
            monitoredIds={monitoredIds()}
            loading={available.loading}
            busy={busy()}
            onAdd={handleAdd}
            onRemove={handleRemove}
            onRefetch={refetchAvailable}
            filterType={filterType()}
            setFilterType={setFilterType}
            sortBy={sortBy()}
            setSortBy={setSortBy}
          />
        </Show>
      </div>
    </div>
  );
}
