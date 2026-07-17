import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";

import { supabase, API_BASE_URL, GATEWAY_KEY } from "../lib/supabase";
import { styles, SEVERITY } from "../theme";

type Signal = { id: string; category: string; severity: string; title: string; narrative: string; is_active: boolean };

/**
 * Home — top active signals for the user's fleet, read from the SAME public API
 * the SDK uses (user access token as the bearer). No mobile-side signal engine.
 */
export function HomeScreen() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Signal | null>(null);

  async function load() {
    setLoading(true);
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    try {
      const res = await fetch(`${API_BASE_URL}/v1/signals?active=true&limit=5`, {
        headers: { Authorization: `Bearer ${token}`, apikey: GATEWAY_KEY },
      });
      const json = await res.json();
      setSignals(json.data ?? []);
    } catch { /* offline: keep last */ }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  if (selected) return <SignalDetail signal={selected} onBack={() => setSelected(null)} />;

  return (
    <View style={styles.screen}>
      <View style={styles.headerRow}>
        <Text style={styles.h1}>Signals</Text>
        <Pressable onPress={() => supabase.auth.signOut()}><Text style={styles.link}>Sign out</Text></Pressable>
      </View>
      <Text style={styles.subtitle}>Top active signals for your fleet.</Text>
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color="#1019EC" /> : (
        <FlatList
          data={signals}
          keyExtractor={(s) => s.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#1019EC" />}
          ListEmptyComponent={<Text style={styles.subtitle}>No active signals.</Text>}
          renderItem={({ item }) => (
            <Pressable style={[styles.card, { borderLeftColor: SEVERITY[item.severity] ?? "#6B7280", borderLeftWidth: 3 }]} onPress={() => setSelected(item)}>
              <Text style={styles.badge}>{item.severity.toUpperCase()} · {item.category.replace(/_/g, " ")}</Text>
              <Text style={styles.cardTitle}>{item.title}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function SignalDetail({ signal, onBack }: { signal: Signal; onBack: () => void }) {
  return (
    <View style={styles.screen}>
      <Pressable onPress={onBack}><Text style={styles.link}>‹ Back</Text></Pressable>
      <Text style={[styles.badge, { marginTop: 16, color: SEVERITY[signal.severity] ?? "#6B7280" }]}>{signal.severity.toUpperCase()} · {signal.category.replace(/_/g, " ")}</Text>
      <Text style={styles.h1}>{signal.title}</Text>
      <Text style={styles.body}>{signal.narrative}</Text>
    </View>
  );
}
