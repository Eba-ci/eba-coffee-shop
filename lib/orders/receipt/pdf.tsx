// lib/orders/receipt/pdf.tsx
//
// Rendu PDF du reçu client (serveur uniquement).

import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';
import type { ContactSettings } from '@/lib/contact-settings';
import type { Receipt } from './build';

const money = (n: number) =>
  `${new Intl.NumberFormat('fr-FR').format(n).replace(/[  ]/g, ' ')} FCFA`;

const s = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#2b1a12',
  },
  brand: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#6c3077' },
  muted: { color: '#6b5b52' },
  head: { marginBottom: 18 },
  logo: { width: 80, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  line: { paddingVertical: 6, borderBottomWidth: 0.5, borderColor: '#ddd' },
  name: { fontFamily: 'Helvetica-Bold' },
  detail: { fontSize: 9, color: '#6b5b52', marginTop: 2 },
  total: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginTop: 10 },
  foot: { marginTop: 28, textAlign: 'center', color: '#6b5b52' },
});

export function ReceiptDocument({
  receipt,
  contact,
  logo,
}: {
  receipt: Receipt;
  contact: ContactSettings;
  logo?: Buffer | null;
}) {
  return (
    <Document title={`Reçu ${receipt.code}`} author="EBA Coffee Shop">
      <Page size="A5" style={s.page}>
        <View style={s.head}>
          {logo && (
            // eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf : pas d'attribut alt
            <Image src={{ data: logo, format: 'png' }} style={s.logo} />
          )}
          <Text style={s.brand}>EBA Coffee Shop</Text>
          <Text style={s.muted}>
            {contact.address}, {contact.district}
          </Text>
          <Text style={s.muted}>{contact.phone}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.name}>Reçu — commande {receipt.code}</Text>
          <Text style={s.muted}>
            {receipt.dailyNumber} · {receipt.date}
          </Text>
        </View>
        {receipt.customerName && (
          <Text style={[s.muted, { marginTop: 2 }]}>
            Client : {receipt.customerName}
          </Text>
        )}
        <View style={{ marginTop: 12 }}>
          {receipt.lines.map((l, i) => (
            <View key={i} style={s.line} wrap={false}>
              <View style={s.row}>
                <Text style={s.name}>
                  {l.quantity} × {l.productName}
                </Text>
                <Text>{money(l.net)}</Text>
              </View>
              {l.details.map((d, j) => (
                <Text key={j} style={s.detail}>
                  {d}
                </Text>
              ))}
              {l.gross !== l.net && (
                <Text style={s.detail}>Remise : -{money(l.gross - l.net)}</Text>
              )}
            </View>
          ))}
        </View>
        {receipt.loyaltyDiscount > 0 && (
          <View style={[s.row, { marginTop: 8 }]}>
            <Text>Réduction fidélité</Text>
            <Text>-{money(receipt.loyaltyDiscount)}</Text>
          </View>
        )}
        <View style={[s.row, s.total]}>
          <Text>Total</Text>
          <Text>{money(receipt.total)}</Text>
        </View>
        <Text style={[s.muted, { marginTop: 4 }]}>
          {receipt.paid
            ? `Payé${receipt.paymentLabel ? ` — ${receipt.paymentLabel}` : ''}`
            : 'Non payé'}
        </Text>
        <Text style={s.foot}>Merci de votre visite !</Text>
      </Page>
    </Document>
  );
}
