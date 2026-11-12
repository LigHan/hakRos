import type { ImageSource } from 'expo-image';

export type PlacePhotoSource = {
  key: string;
  source: number | ImageSource;
  credit?: { author: string; year: string; license: string; page: `https://${string}` };
};

export type PlacePhotoData = {
  id: string;
  place: string;
  image?: string | null;
  gallery?: readonly string[];
  category?: string | null;
};

// Keep seed records and the API as they are. Only replace the known original
// covers in the catalog; a company-uploaded cover always takes precedence.
const archive: Partial<Record<string, { oldCover: string; photo: PlacePhotoSource }>> = {
  '1': {
    oldCover: 'https://upload.wikimedia.org/wikipedia/commons/6/62/Donetsk_Scherbakov_Park.jpg',
    photo: {
      key: 'scherbakov-park',
      source: require('@/assets/images/places/scherbakov-park.jpg'),
      credit: {
        author: 'Vadim Tolbatov',
        year: '2016',
        license: 'CC BY-SA 4.0',
        page: 'https://commons.wikimedia.org/wiki/File:Donetsk_Scherbakov_Park.jpg',
      },
    },
  },
  '2': {
    oldCover: 'https://cdn.culture.ru/images/795e55ba-477e-5bc6-9c0b-3d4b8328e08b',
    photo: {
      key: 'war-museum',
      source: require('@/assets/images/places/war-museum.jpg'),
      credit: {
        author: 'Andrey Butko',
        year: '2015',
        license: 'CC BY-SA 3.0',
        page: 'https://commons.wikimedia.org/wiki/File:2015-05-06._%D0%9C%D1%83%D0%B7%D0%B5%D0%B9_%D0%92%D0%9E%D0%92_%D0%B2_%D0%94%D0%BE%D0%BD%D0%B5%D1%86%D0%BA%D0%B5_054.jpg',
      },
    },
  },
  '3': {
    oldCover: 'https://avatars.mds.yandex.net/get-altay/1903890/2a00000169d6115feb1904cd6b2e8f6c63cf/XXXL',
    photo: {
      key: 'forged-figures-park',
      source: require('@/assets/images/places/forged-figures-park.jpg'),
      credit: {
        author: 'Роман Донецкий',
        year: '2018',
        license: 'CC BY-SA 4.0',
        page: 'https://commons.wikimedia.org/wiki/File:1park_kovanyih_figur.jpg',
      },
    },
  },
  '4': {
    oldCover: 'https://core-pht-proxy.maps.yandex.ru/v1/photos/download?photo_id=mtpbU5DRUI2xSXV1tP5Ahg&image_size=XXXL',
    photo: {
      key: 'lenin-square',
      source: require('@/assets/images/places/lenin-square.jpg'),
      credit: {
        author: 'Andrey Butko',
        year: '2010',
        license: 'CC BY-SA 3.0',
        page: 'https://commons.wikimedia.org/wiki/File:%D0%9F%D0%BB%D0%BE%D1%89%D0%B0%D0%B4%D1%8C_%D0%9B%D0%B5%D0%BD%D0%B8%D0%BD%D0%B0_012.JPG',
      },
    },
  },
  '5': {
    oldCover: 'https://avatars.mds.yandex.net/get-altay/10963815/2a0000018c8239fa056823daa2451d86022c/XXXL',
    photo: {
      key: 'donbass-palace',
      source: require('@/assets/images/places/donbass-palace.jpg'),
      credit: {
        author: 'SergKh78',
        year: '2007',
        license: 'CC BY-SA 4.0',
        page: 'https://commons.wikimedia.org/wiki/File:%D0%93%D0%BE%D1%81%D1%82%D0%B8%D0%BD%D0%B8%D1%86%D0%B0_%D0%94%D0%BE%D0%BD%D0%B1%D0%B0%D1%81%D1%81_%D0%BF%D0%B0%D0%BB%D0%B0%D1%86.jpg',
      },
    },
  },
  '7': {
    oldCover: 'https://cdn-storage-media.tass.ru/tass_media/2022/03/13/F/1647204201434011_FvjY-8wd.jpg',
    photo: {
      key: 'donbass-arena',
      source: require('@/assets/images/places/donbass-arena.jpg'),
      credit: {
        author: 'Валерий Дед',
        year: '2014',
        license: 'CC BY 3.0',
        page: 'https://commons.wikimedia.org/wiki/File:Donetsk_Donbass_Arena_40.jpg',
      },
    },
  },
};
const legacyCoffeeCover = 'https://yandex-images.clstorage.net/hfH560y79/942910BN/ALfIu_Wv-gZqWMTBUio_N9Fe';
const copiedGalleryStart = 'https://core-pht-proxy.maps.yandex.ru/v1/photos/download?photo_id=VMzAlGyrjo9sBuOjlX-bdA&image_size=X5L';
const wallpaper = 'https://img.goodfon.ru/wallpaper/nbig/b/42/pirozhnoe-eklery-kofe-kofeynye.webp';

export function getPlacePhotos(place: PlacePhotoData): PlacePhotoSource[] {
  const saved = archive[place.id];
  const cover = place.image?.trim();
  const verified = saved && cover === saved.oldCover ? saved.photo : undefined;
  // The original data for the square and the stadium repeats the park's gallery.
  const copiedGallery = (place.id === '4' || place.id === '7') && place.gallery?.[0] === copiedGalleryStart;
  const gallery = copiedGallery ? [] : (place.gallery ?? []);
  const urls = new Set([verified ? undefined : cover, ...gallery]);
  const originals = Array.from(urls).flatMap((uri): PlacePhotoSource[] => {
    if (!uri || !/^https?:\/\//i.test(uri)) return [];
    if (place.id === '6' && (uri === wallpaper || uri.startsWith(legacyCoffeeCover))) return [];
    return [{ key: uri, source: { uri } }];
  });
  return verified ? [verified, ...originals] : originals;
}
