import React, { useState, useEffect } from 'react';
import { View, Text, Button, FlatList, StyleSheet, Alert, Linking, TouchableOpacity, PermissionsAndroid, ActivityIndicator } from 'react-native';
import { BluetoothManager, BluetoothEscposPrinter } from 'react-native-bluetooth-escpos-printer';

const App = () => {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState(null);

  useEffect(() => {
    const handleDeepLink = async (event) => {
      if (event.url && event.url.startsWith('miterprint://')) {
        try {
          const rawPayload = event.url.replace('miterprint://', '');

          // 🔥 FIXED PART (SAFE JSON PARSE)
          let printerData;
          try {
            const decoded = decodeURIComponent(rawPayload);
            printerData = JSON.parse(decoded);
          } catch (e) {
            // fallback if invalid JSON
            printerData = { raw: decodeURIComponent(rawPayload) };
          }

          if (connectedDevice) {
            await runPrintJob(printerData);
          } else {
            Alert.alert("Printer Offline", "Connect to a printer first!");
          }
        } catch (e) {
          console.error(e);
        }
      }
    };

    const sub = Linking.addEventListener('url', handleDeepLink);
    Linking.getInitialURL().then(url => url && handleDeepLink({ url }));
    return () => sub.remove();
  }, [connectedDevice]);

  const scan = async () => {
    setLoading(true);
    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);

      const enabled = await BluetoothManager.isBluetoothEnabled();

      if (!enabled || enabled === "false") {
        try {
          await BluetoothManager.enableBluetooth();
        } catch (e) {
          Alert.alert("Action Required", "Please manually turn on Bluetooth and Location (GPS) in your phone settings.");
          setLoading(false);
          return;
        }
      }

      setTimeout(async () => {
        try {
          const result = await BluetoothManager.scanDevices();
          const parsed = JSON.parse(result);
          const found = [...(parsed.paired || []), ...(parsed.found || [])];
          setDevices(found);
          setLoading(false);
        } catch (err) {
          Alert.alert("Scan Failed", "Ensure Location/GPS is turned ON. Android needs it to find Bluetooth devices.");
          setLoading(false);
        }
      }, 1000);

    } catch (e) {
      setLoading(false);
      Alert.alert("Error", "Check app permissions in Settings.");
    }
  };

  const connect = async (device) => {
    setLoading(true);
    try {
      await BluetoothManager.connect(device.address);
      setConnectedDevice(device);
      Alert.alert("Success", "Printer Connected!");
    } catch (e) {
      Alert.alert("Connection Failed", "Make sure the printer is in pairing mode.");
    } finally {
      setLoading(false);
    }
  };

  const runPrintJob = async (data) => {
    try {
      console.log("RECEIVED DATA:", data);

      await BluetoothEscposPrinter.printerAlign(
        BluetoothEscposPrinter.ALIGN.LEFT
      );

      await BluetoothEscposPrinter.printText("----- PRINT START -----\n", {});

      for (const key in data) {
        const value = data[key];

        const printableValue =
          typeof value === "object"
            ? JSON.stringify(value)
            : value;

        await BluetoothEscposPrinter.printText(
          `${key}: ${printableValue}\n`,
          {}
        );
      }

      await BluetoothEscposPrinter.printText("------ PRINT END ------\n\n\n", {});

    } catch (e) {
      console.error("PRINT ERROR:", e);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Miter Print Bridge</Text>
      <View style={styles.statusBox}>
        <Text style={{ color: connectedDevice ? '#22c55e' : '#ef4444', fontWeight: 'bold' }}>
          {connectedDevice ? `Ready: ${connectedDevice.name}` : '🔴 Not Connected'}
        </Text>
      </View>

      <Button
        title={loading ? "Searching..." : "Scan for Printers"}
        onPress={scan}
        disabled={loading}
        color="#2563eb"
      />

      {loading && <ActivityIndicator size="large" color="#22c55e" style={{ marginTop: 20 }} />}

      <FlatList
        data={devices}
        keyExtractor={(item, index) => item.address + index}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => connect(item)} style={styles.card}>
            <Text style={{ color: 'white', fontWeight: 'bold' }}>
              {item.name || "Unknown Printer"}
            </Text>
            <Text style={{ color: '#94a3b8', fontSize: 12 }}>
              {item.address}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 20, paddingTop: 60 },
  header: { color: 'white', fontSize: 26, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  statusBox: { padding: 15, backgroundColor: '#1e293b', borderRadius: 10, marginBottom: 20, alignItems: 'center' },
  card: { padding: 15, backgroundColor: '#1e293b', marginTop: 10, borderRadius: 8 }
});

export default App;