import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { supabase } from "../lib/supabase";
import { styles } from "../theme";

/** TOTP challenge — same Supabase MFA the web app uses. */
export function TwoFactorScreen({ onVerified }: { onVerified: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    setError(null);
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totp = factors?.totp?.[0];
    if (!totp) { setError("No TOTP factor enrolled."); return; }
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId: totp.id });
    if (cErr || !challenge) { setError(cErr?.message ?? "challenge failed"); return; }
    const { error: vErr } = await supabase.auth.mfa.verify({ factorId: totp.id, challengeId: challenge.id, code });
    if (vErr) { setError(vErr.message); return; }
    onVerified();
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.h1}>Two-factor</Text>
      <Text style={styles.subtitle}>Enter the 6-digit code from your authenticator app.</Text>
      <TextInput style={styles.input} placeholder="123456" placeholderTextColor="#6B7280" keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode} />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={styles.primaryBtn} onPress={verify}><Text style={styles.primaryBtnText}>Verify</Text></Pressable>
    </View>
  );
}
