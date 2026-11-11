import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Alert,
  ActivityIndicator
} from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';

// Типы для сообщений между WebView и React Native
interface MapCoordinates {
  latitude: number;
  longitude: number;
}

interface MapMessage {
  type: 'MAP_CLICK' | 'SEARCH_RESULT' | 'MAP_LOADED' | 'ROUTE_BUILT' | 'ERROR';
  latitude?: number;
  longitude?: number;
  address?: string;
  error?: string;
}

interface YandexMapProps {
  apiKey: string;
  initialLocation?: MapCoordinates;
  onLocationSelect?: (coords: MapCoordinates, address?: string) => void;
}

export type YandexMapHandle = {
  searchAddress: (address: string) => void;
  moveToCoordinates: (coords: MapCoordinates) => void;
  buildRoute: (address: string, start?: MapCoordinates) => void;
  getSelectedLocation: () => MapCoordinates;
  getSelectedAddress: () => string | undefined;
};

const YandexMap = forwardRef<YandexMapHandle, YandexMapProps>(({
  apiKey,
  initialLocation = { latitude: 55.7558, longitude: 37.6173 },
  onLocationSelect
}, ref) => {
  const webViewRef = useRef<WebView<WebViewProps>>(null);
  const [selectedLocation, setSelectedLocation] = useState<MapCoordinates>(initialLocation);
  const [address, setAddress] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // HTML шаблон для Яндекс Карт
  const getMapHTML = (): string => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU"></script>
    <style>
        body, html, #map {
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
        }
        .balloon {
            padding: 10px;
            max-width: 200px;
        }
    </style>
</head>
<body>
    <div id="map"></div>
    <script>
        let map;
        let currentMarker;
        let currentRoute;

        ymaps.ready(init);

        function init() {
            // Отправляем сообщение о загрузке карты
            window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'MAP_LOADED'
            }));

            map = new ymaps.Map('map', {
                center: [${initialLocation.latitude}, ${initialLocation.longitude}],
                zoom: 12,
                controls: ['zoomControl', 'fullscreenControl']
            });

            // Добавляем начальный маркер
            currentMarker = new ymaps.Placemark([${initialLocation.latitude}, ${initialLocation.longitude}], {
                balloonContent: 'Начальная позиция'
            }, {
                preset: 'islands#blueDotIcon'
            });

            map.geoObjects.add(currentMarker);

            // Обработчик клика по карте
            map.events.add('click', function (e) {
                const coords = e.get('coords');

                // Обновляем маркер
                map.geoObjects.remove(currentMarker);
                currentMarker = new ymaps.Placemark(coords, {
                    balloonContent: 'Выбранная точка<br/>Координаты: ' + coords.join(', ')
                }, {
                    preset: 'islands#redIcon'
                });

                map.geoObjects.add(currentMarker);

                // Получаем адрес по координатам
                ymaps.geocode(coords).then(function (res) {
                    const firstGeoObject = res.geoObjects.get(0);
                    const address = firstGeoObject.getAddressLine();

                    // Отправляем данные в React Native
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'MAP_CLICK',
                        latitude: coords[0],
                        longitude: coords[1],
                        address: address
                    }));
                });
            });
        }

        // Функция для поиска адреса
        window.searchAddress = function(address) {
            if (!address) return;

            ymaps.geocode(address).then(function (res) {
                const firstGeoObject = res.geoObjects.get(0);
                if (!firstGeoObject) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'ERROR',
                        error: 'Адрес не найден'
                    }));
                    return;
                }

                const coords = firstGeoObject.geometry.getCoordinates();
                const foundAddress = firstGeoObject.getAddressLine();

                // Обновляем карту
                map.setCenter(coords, 15);
                map.geoObjects.remove(currentMarker);
                if (currentRoute) {
                    map.geoObjects.remove(currentRoute);
                    currentRoute = null;
                }

                currentMarker = new ymaps.Placemark(coords, {
                    balloonContent: foundAddress
                }, {
                    preset: 'islands#greenIcon'
                });

                map.geoObjects.add(currentMarker);

                // Отправляем результат
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'SEARCH_RESULT',
                    latitude: coords[0],
                    longitude: coords[1],
                    address: foundAddress
                }));
            }).catch(function (error) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'ERROR',
                    error: 'Ошибка поиска: ' + error
                }));
            });
        };

        // Функция для перемещения карты к координатам
        window.moveToCoordinates = function(lat, lon) {
            const coords = [lat, lon];
            map.setCenter(coords, 15);

            map.geoObjects.remove(currentMarker);
            currentMarker = new ymaps.Placemark(coords, {
                balloonContent: 'Новая позиция<br/>Координаты: ' + coords.join(', ')
            }, {
                preset: 'islands#blueIcon'
            });

            map.geoObjects.add(currentMarker);
        };

        window.buildRoute = function(address, startLat, startLon) {
            if (!address) return;

            ymaps.geocode(address).then(function (res) {
                const geoObject = res.geoObjects.get(0);
                if (!geoObject) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'ERROR',
                        error: 'Маршрут не найден'
                    }));
                    return;
                }

                const destinationCoords = geoObject.geometry.getCoordinates();
                const destinationAddress = geoObject.getAddressLine();

                const hasProvidedStart = typeof startLat === 'number' && !Number.isNaN(startLat) && typeof startLon === 'number' && !Number.isNaN(startLon);

                const startPromise = hasProvidedStart
                    ? Promise.resolve([startLat, startLon])
                    : ymaps.geolocation.get({ provider: 'auto', mapStateAutoApply: false })
                        .then(function (result) {
                            const pos = result.geoObjects.position;
                            if (Array.isArray(pos) && pos.length === 2 && typeof pos[0] === 'number' && typeof pos[1] === 'number') {
                                return pos;
                            }
                            return map.getCenter();
                        })
                        .catch(function () {
                            return map.getCenter();
                        });

                startPromise.then(function (startCoords) {
                    ymaps.route([startCoords, destinationCoords], { mapStateAutoApply: true })
                        .then(function(route) {
                            if (currentRoute) {
                                map.geoObjects.remove(currentRoute);
                            }
                            currentRoute = route;
                            map.geoObjects.add(route);

                            if (route && typeof route.getBounds === 'function') {
                                const bounds = route.getBounds();
                                if (bounds) {
                                    map.setBounds(bounds, { checkZoomRange: true, duration: 300 });
                                }
                            }

                            map.geoObjects.remove(currentMarker);
                            currentMarker = new ymaps.Placemark(destinationCoords, {
                                balloonContent: destinationAddress
                            }, {
                                preset: 'islands#redDotIcon'
                            });
                            map.geoObjects.add(currentMarker);

                            window.ReactNativeWebView.postMessage(JSON.stringify({
                                type: 'ROUTE_BUILT',
                                latitude: destinationCoords[0],
                                longitude: destinationCoords[1],
                                address: destinationAddress
                            }));
                        })
                        .catch(function (error) {
                            window.ReactNativeWebView.postMessage(JSON.stringify({
                                type: 'ERROR',
                                error: 'Не удалось построить маршрут: ' + error
                            }));
                        });
                });
            });
        };
    </script>
</body>
</html>
`;

  // Обработчик сообщений из WebView
  const handleWebViewMessage = (event: WebViewMessageEvent) => {
    try {
      const data: MapMessage = JSON.parse(event.nativeEvent.data);

      switch (data.type) {
        case 'MAP_LOADED':
          setIsLoading(false);
          break;

        case 'MAP_CLICK':
          if (data.latitude && data.longitude) {
            const newCoords: MapCoordinates = {
              latitude: data.latitude,
              longitude: data.longitude
            };
            setSelectedLocation(newCoords);
            setAddress(data.address || '');
            onLocationSelect?.(newCoords, data.address);
          }
          break;

        case 'SEARCH_RESULT':
          if (data.latitude && data.longitude) {
            const newCoords: MapCoordinates = {
              latitude: data.latitude,
              longitude: data.longitude
            };
            setSelectedLocation(newCoords);
            setAddress(data.address || '');
            onLocationSelect?.(newCoords, data.address);
          }
          break;

        case 'ROUTE_BUILT':
          if (data.latitude && data.longitude) {
            const routeCoords: MapCoordinates = {
              latitude: data.latitude,
              longitude: data.longitude
            };
            setSelectedLocation(routeCoords);
            setAddress(data.address || '');
            onLocationSelect?.(routeCoords, data.address);
          }
          break;

        case 'ERROR':
          Alert.alert('Ошибка', data.error || 'Произошла ошибка');
          break;
      }
    } catch (error) {
      console.error('Error parsing WebView message:', error);
    }
  };

  const searchAddress = (query: string) => {
    if (!query.trim()) return;
    const addressJson = JSON.stringify(query.trim());
    webViewRef.current?.injectJavaScript(`
      window.searchAddress(${addressJson});
      true;
    `);
  };

  const moveToCoordinates = (coords: MapCoordinates) => {
    webViewRef.current?.injectJavaScript(`
      window.moveToCoordinates(${coords.latitude}, ${coords.longitude});
      true;
    `);
  };

  const buildRoute = (destination: string, start?: MapCoordinates) => {
    const trimmed = destination.trim();
    if (!trimmed) return;
    const addressJson = JSON.stringify(trimmed);
    const startLat = start ? start.latitude : 'null';
    const startLon = start ? start.longitude : 'null';
    webViewRef.current?.injectJavaScript(`
      window.buildRoute(${addressJson}, ${startLat}, ${startLon});
      true;
    `);
  };

  useImperativeHandle(ref, () => ({
    searchAddress,
    moveToCoordinates,
    buildRoute,
    getSelectedLocation: () => selectedLocation,
    getSelectedAddress: () => address,
  }), [address, selectedLocation]);

  return (
    <View style={styles.container}>
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0000ff" />
        </View>
      )}
      <WebView<WebViewProps>
        ref={webViewRef}
        source={{ html: getMapHTML() }}
        style={styles.webview}
        onMessage={handleWebViewMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        onLoadStart={() => setIsLoading(true)}
        onLoadEnd={() => setIsLoading(false)}
      />
    </View>
  );
});

YandexMap.displayName = 'YandexMap';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
});

export default YandexMap;
