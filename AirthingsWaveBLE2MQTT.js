var noble = require('noble');
var mqtt = require('mqtt')

const AIRTHINGS_SERVICE_UUID = 'b42e1f6eade711e489d3123b93f75cba'; // Airthings BLE service ID
const MQTT = 'mqtt://test.mosquitto.org'; // MQTT server
var scanningTimeout = 1000 * 2; // two second
var scanningRepeat = scanningTimeout + 1000 * 60 * 60; // Repeat scanning after 60 minutes.

var client = mqtt.connect(MQTT)


console.log('AirthingsWaveBLE2MQTT starting...')
console.log('Scanning for Airthings Wave devices every', scanningRepeat / 1000, 'seconds.');
console.log('Data is published to', MQTT);

client.on('connect', function() {
    console.log('MQTT connected', MQTT);
})

/*
noble.on('stateChange', function(state) {
  if (state === 'poweredOn') {
  //
  // Once the BLE radio has been powered on, it is possible
  // to begin scanning for services. Pass an empty array to
  // scan for all services (uses more time and power).
  //
    console.log('scanning...');
    noble.startScanning(AIRTHINGS_SERVICE_UUID, true);
  } else {  
    noble.stopScanning();
  }
});
*/

// Checking, Scanning, stopping repeatedly
setInterval(function() {
    console.log('Checking if BLE is powered on...');
    if (noble.state === 'poweredOn') {
        console.log('Starting scan for Airthings service(s) ...');
        noble.startScanning(AIRTHINGS_SERVICE_UUID, true);
        setTimeout(function() {
            noble.stopScanning();
            console.log('Stopping scan...');
        }, scanningTimeout)
    }
}, scanningRepeat);

function getValue(data, type) {

    switch (type) {
        case 'uint16':
            return data.readUInt16LE(0);
            break;
        case 'utf8':
            return data.toString('utf8');
            break;
        case 'hex':
            return data.toString('hex');
            break;
        default:
            return data.toString('ascii');
            break;
    }
    return null;
}

function send(data) {
    var topic = 'airthingswave/' + data.peripheralId + '/' + data.name;
    var payload = JSON.stringify(data);
    console.log('mqtt publish topic:' + topic + ', payload:' + payload);
    client.publish(topic, payload);
}

function getData(peripheral, characteristic, datatype, shortname, name, scale, unit) {
    characteristic.read(function(er, data) {
        if (data) {
            var value = getValue(data, datatype);
            var d = {
                peripheralType: 'Airthings Wave',
                peripheralId: peripheral.id,
                rawValue: value,
                value: value * scale,
                uuid: characteristic.uuid,
                name: name, //characteristic.name not always set. Scan for Descriptors.
                shortname: shortname,
                unit: unit

            }
            send(d);
        }
        if (er) {
            console.log('error:', er);
        }

    });
}

noble.on('discover', function(peripheral) {
    var advertisement = peripheral.advertisement;
    var manufacturerData = advertisement.manufacturerData;
    console.log('Found Airthings Wave device: ' + peripheral.id);
    //console.log('Manufacturer data: ' + manufacturerData.toString('hex'));

    peripheral.connect(function(err) {
        setTimeout(function() {
            peripheral.disconnect(function(err) {
                console.log('disconnecting');
            });
        }, 6000); // timeout 6 sec

        // Scan for known airthings service uuid
        peripheral.discoverServices([AIRTHINGS_SERVICE_UUID], function(err, discoveredService) {
            discoveredService.forEach(function(service) {
                // Scan for known characteristic uuid(s) 			
                var airthinsCharacteristics = ['2a6f', '2a6e', 'b42e01aaade711e489d3123b93f75cba', 'b42e0a4cade711e489d3123b93f75cba'];
                service.discoverCharacteristics(airthinsCharacteristics, function(err, characteristics) {
                    characteristics.forEach(function(characteristic) {

                        switch (characteristic.uuid) {
                            case '2a6f': // Humidity
                                getData(peripheral, characteristic, 'uint16', 'humidity', 'Relative humidity', 1.0 / 100.0, '%');
                                break;
                            case '2a6e': // Temperature
                                getData(peripheral, characteristic, 'uint16', 'temperature', 'Temperature', 1.0 / 100.0, 'C');
                                break;
                            case 'b42e01aaade711e489d3123b93f75cba': // Radon 1-day
                                getData(peripheral, characteristic, 'uint16', 'radon1day', 'Radon conc. 1-day', 1.0 / 100.0, 'Bq/m3 day');
                                break;
                            case 'b42e0a4cade711e489d3123b93f75cba': // Radon avr.
                                getData(peripheral, characteristic, 'uint16', 'radonaverage', 'Radon conc. average', 1.0 / 100.0, 'Bq/m3');
                                break;
                            default:
                                break;
                        }

                    });


                });
            });
        });

    });
}); // End on Noble Discover!