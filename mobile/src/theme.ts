import { StyleSheet } from "react-native";

export const SEVERITY: Record<string, string> = {
  critical: "#DC2626", high: "#EA580C", medium: "#CA8A04", low: "#2563EB", info: "#94A3B8",
};

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0a0a0f", paddingHorizontal: 20, paddingTop: 72 },
  logo: { color: "#F5F5F7", fontSize: 34, fontWeight: "300", letterSpacing: 1 },
  logoAccent: { color: "#1019EC", fontWeight: "700" },
  h1: { color: "#F5F5F7", fontSize: 26, fontWeight: "600", marginVertical: 6 },
  subtitle: { color: "#8B8B93", fontSize: 14, marginBottom: 20 },
  body: { color: "#C4C4CC", fontSize: 15, lineHeight: 22, marginTop: 12 },
  input: { backgroundColor: "#14141b", borderColor: "#26262f", borderWidth: 1, color: "#F5F5F7", paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12, fontSize: 15 },
  primaryBtn: { backgroundColor: "#1019EC", paddingVertical: 14, alignItems: "center", marginTop: 8 },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  secondaryBtn: { borderColor: "#26262f", borderWidth: 1, paddingVertical: 14, alignItems: "center", marginTop: 10 },
  secondaryBtnText: { color: "#C4C4CC", fontSize: 15 },
  error: { color: "#DC2626", fontSize: 13, marginBottom: 8 },
  card: { backgroundColor: "#14141b", borderColor: "#26262f", borderWidth: 1, padding: 14, marginBottom: 10 },
  cardTitle: { color: "#F5F5F7", fontSize: 15, fontWeight: "500", marginTop: 4 },
  badge: { color: "#8B8B93", fontSize: 11, fontWeight: "600", letterSpacing: 0.5 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  link: { color: "#1019EC", fontSize: 14 },
});
