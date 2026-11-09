import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Icon } from '../components/ui';
import { useData } from '../store/data';
import { colors } from '../theme';

export function SignInScreen() {
  const signIn = useData((s) => s.signIn);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.page}>
      <View style={st.brand}>
        <View style={st.logo}><Icon name="navigate" size={30} color="#fff" /></View>
        <Text style={st.name}>TheTracker</Text>
        <Text style={st.tag}>Every customer. Every visit. Every day.</Text>
      </View>
      <View style={st.form}>
        <Text style={st.title}>Sign in</Text>
        <TextInput accessibilityLabel="Email" style={st.input} placeholder="Work email" placeholderTextColor={colors.ink4} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" />
        <TextInput accessibilityLabel="Password" style={st.input} placeholder="Password" placeholderTextColor={colors.ink4} value={password} onChangeText={setPassword} secureTextEntry textContentType="password" onSubmitEditing={submit} />
        {!!error && <Text style={st.error}>{error}</Text>}
        <Button title="Sign in" onPress={submit} busy={busy} disabled={!email || !password} />
        <Text style={st.help}>Accounts are created by your manager.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.ink, justifyContent: 'flex-end' },
  brand: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 68, height: 68, borderRadius: 22, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  name: { color: '#fff', fontSize: 32, fontWeight: '800', marginTop: 16, letterSpacing: -0.6 },
  tag: { color: '#B5B2D6', fontSize: 14, marginTop: 6 },
  form: { backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 46 },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink, marginBottom: 16 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.edge, borderRadius: 13, padding: 14, fontSize: 16, marginBottom: 12, color: colors.ink },
  error: { color: colors.bad, fontSize: 14, marginBottom: 12 },
  help: { textAlign: 'center', color: colors.ink3, fontSize: 13, marginTop: 14 },
});
