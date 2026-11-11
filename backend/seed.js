async function insertRows(db, sql, rows) {
  for (const row of rows) {
    await new Promise((resolve, reject) => {
      db.run(sql, row, error => error ? reject(error) : resolve());
    });
  }
}

module.exports = async function seedDemoData(db) {
  await insertRows(db, `
    INSERT INTO posts (id, user, userAvatar, userHandle, place, image, likes, totalLikes, followers, rating, bio, address, category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    [
      '1', 'Парк имени Щербакова',
      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/%D0%94%D0%BE%D0%BD%D0%B5%D1%86%D1%8C%D0%BA.JPG/1280px-%D0%94%D0%BE%D0%BD%D0%B5%D1%86%D1%8C%D0%BA.JPG',
      'scherbakovpark', 'Парк Щербакова',
      'https://upload.wikimedia.org/wikipedia/commons/6/62/Donetsk_Scherbakov_Park.jpg',
      505800, 4040000, 252000, 4.8,
      'Парк Щербакова — зелёный оазис для прогулок, занятий спортом и семейного отдыха. Здесь проходят фестивали, концерты и кинопоказы под открытым небом.',
      'Парк имени Щербакова, Донецк',
      'park'
    ],
    [
      '2', 'Музей ВОВ Донецк',
      'https://sun9-56.userapi.com/s/v1/if1/1wBsSjoL_DE-ioMffbJvgvW-h4rjp9LcNr2wbBYB4oEuK8fotKx2oHQw0SJcFHziiWgQWaEW.jpg?quality=96&as=32x21,48x32,72x48,108x72,160x107,240x160,360x240,480x320,540x360,640x427,720x480,1080x720,1280x853,1350x900&from=bu&cs=1350x0',
      'vov_museum_donetsk', 'Музей Великой Отечественной войны',
      'https://cdn.culture.ru/images/795e55ba-477e-5bc6-9c0b-3d4b8328e08b',
      197600, 2300000, 99000, 4.5,
      'Музей Великой Отечественной войны - одно из главных источрических мест Донецка. Полезные информационные стенды, рассказывающие о подвиге советского народа.',
      'Музей Великой Отечественной войны, Донецк',
      'museum'
    ],
    [
      '3', 'Парк кованных фигур',
      'https://avatars.mds.yandex.net/get-altay/4365916/2a00000179881604fa320ca37be6225d737d/XXXL',
      'steel-park', 'Парк кованных фигур',
      'https://avatars.mds.yandex.net/get-altay/1903890/2a00000169d6115feb1904cd6b2e8f6c63cf/XXXL',
      708000, 1010000, 45000, 4.9,
      'Парк кованных фигур - красивое и необычное сочетание природы и железа',
      'Парк кованных фигур, Донецк',
      'park'
    ],
    [
      '4', 'Администрация Донецка ✔',
      'https://core-pht-proxy.maps.yandex.ru/v1/photos/download?photo_id=xPx2x_gogBtpwm7nBXtxWA&image_size=X5L',
      'donetsk_gov', 'Площадь Ленина',
      'https://core-pht-proxy.maps.yandex.ru/v1/photos/download?photo_id=mtpbU5DRUI2xSXV1tP5Ahg&image_size=XXXL',
      24100000, 760900000, 2500000, 5.0,
      'Страница администрации города Донецк.',
      'площадь Ленина, Донецк',
      'entertainment'
    ],
    [
      '5', 'Отель «Донбасс Палас»',
      'https://avatars.mds.yandex.net/get-altay/1773749/2a0000016e0456c6f4fe3ed691eb36b1a985/XXXL',
      'donbass_palas', 'Отель «Донбасс Палас»',
      'https://avatars.mds.yandex.net/get-altay/10963815/2a0000018c8239fa056823daa2451d86022c/XXXL',
      45900, 990000, 25000, 4.5,
      'Страница отеля «Донбасс Палас».',
      'улица Артёма, 80, Донецк',
      'restaurant'
    ],
    [
      '6', 'Don Coffee',
      'https://i.pinimg.com/736x/13/bd/84/13bd848b15c68200a6a92d7aa61fd5ea.jpg',
      'don-coffee', 'Кофейня Don Coffee',
      'https://yandex-images.clstorage.net/hfH560y79/942910BN/ALfIu_Wv-gZqWMTBUio_N9FeMpKaISvTaAO16U3K7xeL_FIqKF4qzhjPdSAzTC8HMb751hDOE_RZyQw_3eNgbHXjLf8gO7_iGliVheKO_pcQX2ZTThB_8vhDwHmI3IzVif5UTZsZmKn_S7B1Vkw7FoC6nyCBupbzjAwfDR0xVlkAVOnrF-6JQ9nJ5sTCuQ_2MWzmorgzPEMc0Idurq8tlzudZ926uCp6z8jzFyeMWfKB-3yjxSqV0j4Mf_1sgeY7kvX7mZdc-mLrGgTUopkuhUA_VTLoELxTvvO3TRzPrqQZr1bvmMirmQwrQTTmLCqBIxlukvVKZ8F_nHyfXgDm62MGijhVfYsDuOn3VSFrHFfTrQaDOyLuYFyCZd5dbR3my213bAhrKks-6oNnh50ogLI5fIMnK8SzTf2t3_8gxIjh54sKBU9ZcSpJFSfC2B1VQ-9lIXvRz6NfgkVfnP9vZ4qe1M7rCaiZvpiy15bse5KyC0-Cdvv3MFzODt0NgPUbsYTauDXumHPp6BTHMvt89-GcNwI6MvwzPoH0zu1uDbUpz3a9yRkb6YzIUQXnD-mRIStuU2Q6pnA_Hv5_bEEUaNH2iGqEHBlS2yv25wArHsYxLwVyCCFtoX9D9N79vi9l-700j8urikuv2PAFF564c8PqbpJnWWZgDtxsDv5hhqjy9tmqVJzqkyvqdGbTy63H0o3UU1qz_bC_gfYNPZxOJKif9V87uZvL7qrxNcR-OYPhW91C1DoU8Iyv_n68AjSpw_YJuhQcyQDZ-PZVAUg9FsOv1gJoYNwSbtPkv8xN7Ud7X1cPW5trWk7pQgd1b8ugM6m8c-b4pTKMDa7PD3H0mJL2u8nVzPoSeAulNKF7D5bzHpUiGfDdkV0jlt5dPy1lOkyWr3qoK-uf2sNm1F_r8FKLL7LVaqTjj7_M_P0wlMjCVmj6FrwrIZu75PfS2j_14C804mqDbGOukcX-bu49M',
      150000, 890000, 9900, 4.9,
      'Ждем вас у нас!',
      'проспект Богдана Хмельницкого, 100, Донецк',
      'cafe'
    ],
    [
      '7', 'Администрация Донецка ✔',
      'https://core-pht-proxy.maps.yandex.ru/v1/photos/download?photo_id=xPx2x_gogBtpwm7nBXtxWA&image_size=X5L',
      'donetsk_gov', 'Донбасс Арена',
      'https://cdn-storage-media.tass.ru/tass_media/2022/03/13/F/1647204201434011_FvjY-8wd.jpg',
      7100000, 760900000, 2500000, 5.0,
      'Страница администрации города Донецк.',
      'улица Челюскинцев, 189Е, Донецк',
      'entertainment'
    ]
  ]);

  await insertRows(db, `
    INSERT INTO gallery (post_id, image_url, display_order) VALUES (?, ?, ?)
  `, [
    // Для поста 1 - Парк Щербакова
    ['1', 'https://avatars.mds.yandex.net/i?id=fa5cefd9eeeb22774c6cfbed725c2522_l-4628278-images-thumbs&n=13', 0],
    ['1', 'https://yandex-images.clstorage.net/hfH560y79/942910BN/ALfIu_Wv-gZqWMTBUio_N9FeMpKaISvTaAO16U2PaiKeqQKfeG4v_mj_RfDmbH-n8cvZpkD-U7SZDKkvq1bxuZX2iOrxa563D-0QoCdqvweBf-dGqzDucy3SEcyNPnqXfjlijJvJGMlOWNNHJH74c_GLLJMkP-ewX39oXn5xJDlz9FuIR14rwMvJJ6Xhy3yW8j7HcVpRz0CtI-fvzo-eBDkuRP86i6qqfcjy5patyPCy6V1TRtvm8bz8LM59UJY5EwQqOPc8uWHZu6cXkupORRAup1F7Ir4THrO3zE6fPCcJDfafubiImEz60JYXTgsTAMqc8zWoRBOuzRyuj0PXqRBmGLn37EiSqBplNuOLHbbjrySjSfAtgU0CZP4crN5W2563PQr6WlpteUA1lpw50sKZ_UI3qdUzvNzOzywx5cjBJrmZ1Y_Kc6koNQQx-Y8WAd3HEEjyvcMuoCQNPW_dVvsfdq94exupztujVxROuaDzKewzZLvVAY_dnx8fsvT7YiRLOeQcmhD4mgWl8PtMtwA9NzMpUB-wfINl7g7_vFVKjgc-Gqm4-GyogUenPovwEPud0Pa4RiGuDI3eTvKXK5KGKvgFb_piqki0V3HafnTiHQXjS2HPA07zV_2fbf2XSp4X7jh5aooumoP1Npyo4LH7bUGnWqTgrs2OvY7ipukA97jYl6_ZYvuIZNeCG461YJzWA_hgLKGf0gVvD3w9VUhN18xZODmo70pz5ycc6ZKwy76hJqqGUR0dPd78ciSakof6uyWu6GIrmCRXoYh8p-KvBIBosT2DnYM3vC7e7Ada_yYd-lvqaE0aE8XXjUnRA_kPsNSJVKN8LA8cTbAkOMI2Scjln7limevlh5Ka3VSxzqSzWjENMt6jRiwvXd_3KJ63bzp5q3uMujL2lzyY4oKYroD02TWB7-08jkxhJ4qgBbuJhc_pwkrYJvdDqT7k8A3XEmpSHgN_YzVfnq8sQ', 1],
    ['1', 'https://avatars.dzeninfra.ru/get-zen_doc/271828/pub_686aa1b108ff0248e56f6165_686aa1b108ff0248e56f6166/scale_1200', 2],
    ['1', 'https://a.d-cd.net/aIAAAgO7gOA-1920.jpg', 3],
    ['1', 'https://present5.com/presentacii/20170505/46-doneckaya_narodnaya_respublika_-_rodina_moya_(urok).pptx_images/46-doneckaya_narodnaya_respublika_-_rodina_moya_(urok).pptx_1.jpg', 4],
    ['1', 'https://avatars.mds.yandex.net/i?id=5d81ba97a6e13980011cad59f8a6ba0f_l-5236382-images-thumbs&n=13', 5],
    ['1', 'https://pp.userapi.com/c630724/v630724831/507a4/_ZY4KMKRRrU.jpg', 6],
    ['1', 'https://i2016.otzovik.com/2016/05/02/3298328/img/55868034.jpeg', 7],

    // Для поста 2 - Музей ВОВ
    ['2', 'https://sun9-5.userapi.com/s/v1/if2/dkBaRZWYkiy52ClKSCYTHhX-BZjpq2XBJmnW4cLUXpdOz6OgVYbvWEEQCmF1vdsU7eAkojRdh6DDiiC-FAq8MHet.jpg?quality=96&as=32x21,48x32,72x48,108x72,160x107,240x160,360x240,480x320,540x360,640x427,720x480,1080x720,1280x853,1440x960,2560x1707&from=bu&cs=2560x0', 0],
    ['2', 'https://sun9-73.userapi.com/s/v1/if2/ghdVnlZwlthRgxusvB59i0bFe5RJTbJUwKLxAd_JKiYi3OAfABoq1xziYhhXJkDKXxU2zTg8VQ2FRm_s7EU8DHuS.jpg?quality=96&as=32x21,48x32,72x48,108x72,160x107,240x160,360x240,480x320,540x360,640x427,720x480,1080x720,1280x853,1440x960,2560x1707&from=bu&cs=2560x0', 1],
    ['2', 'https://sun9-43.userapi.com/s/v1/if1/KExLvpmQirLsRPVcinJFSOlK4eb_FP3UYBLmhkSBYYZYC3EiuJLuMKAS_sXd3QHakB1KG3x4.jpg?quality=96&as=32x21,48x32,72x48,108x72,160x107,240x160,360x240,480x320,540x360,640x427,720x480,1080x720,1280x853,1350x900&from=bu&cs=1350x0', 2],
    ['2', 'https://sun9-18.userapi.com/s/v1/if1/MTgeMqwMirmMQ4vvJBNGoFx_1WJxopX2jKzkuGMxYijZCRl7QVet5WamUVbDkL6aFGKMA88W.jpg?quality=96&as=32x21,48x32,72x48,108x72,160x107,240x160,360x240,480x320,540x360,640x427,720x480,1080x720,1280x853,1350x900&from=bu&cs=1350x0', 3],
    ['2', 'https://sun9-58.userapi.com/s/v1/if1/dfiv3rB7QuhTnNtNaAT6G-A5lBIu6AVjdGwRFDKAztS3zw2bZtshdK9509D2cf3F_s1F9Cw7.jpg?quality=96&as=32x21,48x32,72x48,108x72,160x107,240x160,360x240,480x320,540x360,640x427,720x480,1080x720,1280x853,1350x900&from=bu&cs=1350x0', 4],
    ['2', 'https://sun9-38.userapi.com/s/v1/if1/Mgk9msGlhldtbXKooaMpxaXcTDN4cOz_r8sKyjKoxKkc3IsZEg8H-TQeMsuGbz1hNitluV2a.jpg?quality=96&as=32x21,48x32,72x48,108x72,160x107,240x160,360x240,480x320,540x360,640x427,720x480,1080x720,1280x853,1350x900&from=bu&cs=1350x0', 5],
    ['2', 'https://sun9-70.userapi.com/s/v1/if2/QnFYEEPNtiuLkTf3IoOiK_WPitC2qZgz3CnZdXtTf8rD_jSzE9nXD3G8ookgUKyjo3Uhk9T02n8yLd_MRIpJYOpB.jpg?quality=96&as=32x21,48x32,72x48,108x72,160x107,240x160,360x240,480x320,540x360,640x426,720x480,1080x720,1280x853,1361x907&from=bu&cs=1361x0', 6],
    ['2', 'https://sun9-61.userapi.com/s/v1/if2/WsxuHNZaQAfBr0kwNrmC8WKyNBNp1jQsUZ-WA23m1__XfUaxt4rHbJwyZCVcikbgXPlThPO3kV0GGDcZBWRI1CvL.jpg?quality=96&as=32x21,48x32,72x48,108x72,160x107,240x160,360x240,480x320,540x360,640x426,720x480,1080x720,1280x853,1361x907&from=bu&cs=1361x0', 7],

    // Для поста 3 - Парк кованных фигур
    ['3', 'https://storage.yandexcloud.net/regions/posts/media/thumbnails/2024/09/large/5UHLRnbgwc1XCEX3Uq5Vq5nzzgYMlPFI5GWJ8eeK.jpg', 0],
    ['3', 'https://upload.wikimedia.org/wikipedia/commons/9/9f/1park_kovanyih_figur.jpg', 1],
    ['3', 'https://upload.wikimedia.org/wikipedia/commons/8/86/%D0%9F%D0%B0%D1%80%D0%BA_%D0%BA%D0%BE%D0%B2%D0%B0%D0%BD%D0%BD%D1%8B%D1%85_%D1%84%D0%B8%D0%B3%D1%83%D1%80_-_panoramio.jpg', 2],
    ['3', 'https://cdn.fishki.net/upload/post/201511/12/1733917/9225179_9f5da12d.jpg', 3],
    ['3', 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/%D0%90%D0%BB%D0%B5%D1%8F_%D0%B0%D1%80%D0%BE%D0%BA_%D0%9F%D0%B0%D1%80%D0%BA_%D0%BA%D0%BE%D0%B2%D0%B0%D0%BD%D0%B8%D1%85_%D1%84%D1%96%D0%B3%D1%83%D1%80.JPG/1400px-%D0%90%D0%BB%D0%B5%D1%8F_%D0%B0%D1%80%D0%BE%D0%BA_%D0%9F%D0%B0%D1%80%D0%BA_%D0%BA%D0%BE%D0%B2%D0%B0%D0%BD%D0%B8%D1%85_%D1%84%D1%96%D0%B3%D1%83%D1%80.JPG', 4],
    ['3', 'https://avatars.dzeninfra.ru/get-zen_doc/271828/pub_66cac9bdeffbd40e42e6098b_66cac9deb8c9e43ea2fce987/scale_1200', 5],
    ['3', 'https://tvkrasnodar.ru/upload/iblock/650/650d0d49594e5b5b7528b90b309dc96d.jpg', 6],
    ['3', 'https://avatars.dzeninfra.ru/get-zen_doc/271828/pub_6790a4ef3d6b79211452973f_6790a6f6fa87ea6b3d90a375/scale_1200', 7],

    // Для поста 4 - Администрация (Площадь Ленина)
    ['4', 'https://core-pht-proxy.maps.yandex.ru/v1/photos/download?photo_id=VMzAlGyrjo9sBuOjlX-bdA&image_size=X5L', 0],
    ['4', 'https://core-pht-proxy.maps.yandex.ru/v1/photos/download?photo_id=nuS_pBa3X0UKpszeOcdBgg&image_size=X5L', 1],
    ['4', 'https://upload.wikimedia.org/wikipedia/commons/8/86/%D0%9F%D0%B0%D1%80%D0%BA_%D0%BA%D0%BE%D0%B2%D0%B0%D0%BD%D0%BD%D1%8B%D1%85_%D1%84%D0%B8%D0%B3%D1%83%D1%80_-_panoramio.jpg', 2],
    ['4', 'https://core-pht-proxy.maps.yandex.ru/v1/photos/download?photo_id=EA6bZwnWJb9Qw2gOsIaluA&image_size=X4L', 3],
    ['4', 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/%D0%90%D0%BB%D0%B5%D1%8F_%D0%B0%D1%80%D0%BE%D0%BA_%D0%9F%D0%B0%D1%80%D0%BA_%D0%BA%D0%BE%D0%B2%D0%B0%D0%BD%D0%B8%D1%85_%D1%84%D1%96%D0%B3%D1%83%D1%80.JPG/1400px-%D0%90%D0%BB%D0%B5%D1%8F_%D0%B0%D1%80%D0%BE%D0%BA_%D0%9F%D0%B0%D1%80%D0%BA_%D0%BA%D0%BE%D0%B2%D0%B0%D0%BD%D0%B8%D1%85_%D1%84%D1%96%D0%B3%D1%83%D1%80.JPG', 4],
    ['4', 'https://avatars.dzeninfra.ru/get-zen_doc/271828/pub_66cac9bdeffbd40e42e6098b_66cac9deb8c9e43ea2fce987/scale_1200', 5],
    ['4', 'https://tvkrasnodar.ru/upload/iblock/650/650d0d49594e5b5b7528b90b309dc96d.jpg', 6],
    ['4', 'https://avatars.dzeninfra.ru/get-zen_doc/271828/pub_6790a4ef3d6b79211452973f_6790a6f6fa87ea6b3d90a375/scale_1200', 7],

    // Для поста 5 - Отель Донбасс Палас
    ['5', 'https://avatars.mds.yandex.net/get-altay/1773749/2a0000016e0456dbe121bc6fddd054dda0f6/XXXL', 0],
    ['5', 'https://avatars.mds.yandex.net/get-altay/5234599/2a00000180b69a0befd1df5b820691e5e5a3/XXXL', 1],
    ['5', 'https://avatars.mds.yandex.net/get-altay/11522875/2a0000018e6b5c4cfc109d67591f8e07e604/XXXL', 2],

    // Для поста 6 - Don Coffee
    ['6', 'https://img.goodfon.ru/wallpaper/nbig/b/42/pirozhnoe-eklery-kofe-kofeynye.webp', 0],

    // Для поста 7 - Администрация (Донбасс Арена)
    ['7', 'https://core-pht-proxy.maps.yandex.ru/v1/photos/download?photo_id=VMzAlGyrjo9sBuOjlX-bdA&image_size=X5L', 0],
    ['7', 'https://core-pht-proxy.maps.yandex.ru/v1/photos/download?photo_id=nuS_pBa3X0UKpszeOcdBgg&image_size=X5L', 1],
    ['7', 'https://upload.wikimedia.org/wikipedia/commons/8/86/%D0%9F%D0%B0%D1%80%D0%BA_%D0%BA%D0%BE%D0%B2%D0%B0%D0%BD%D0%BD%D1%8B%D1%85_%D1%84%D0%B8%D0%B3%D1%83%D1%80_-_panoramio.jpg', 2],
    ['7', 'https://core-pht-proxy.maps.yandex.ru/v1/photos/download?photo_id=EA6bZwnWJb9Qw2gOsIaluA&image_size=X4L', 3],
    ['7', 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/%D0%90%D0%BB%D0%B5%D1%8F_%D0%B0%D1%80%D0%BE%D0%BA_%D0%9F%D0%B0%D1%80%D0%BA_%D0%BA%D0%BE%D0%B2%D0%B0%D0%BD%D0%B8%D1%85_%D1%84%D1%96%D0%B3%D1%83%D1%80.JPG/1400px-%D0%90%D0%BB%D0%B5%D1%8F_%D0%B0%D1%80%D0%BE%D0%BA_%D0%9F%D0%B0%D1%80%D0%BA_%D0%BA%D0%BE%D0%B2%D0%B0%D0%BD%D0%B8%D1%85_%D1%84%D1%96%D0%B3%D1%83%D1%80.JPG', 4],
    ['7', 'https://avatars.dzeninfra.ru/get-zen_doc/271828/pub_66cac9bdeffbd40e42e6098b_66cac9deb8c9e43ea2fce987/scale_1200', 5],
    ['7', 'https://tvkrasnodar.ru/upload/iblock/650/650d0d49594e5b5b7528b90b309dc96d.jpg', 6],
    ['7', 'https://avatars.dzeninfra.ru/get-zen_doc/271828/pub_6790a4ef3d6b79211452973f_6790a6f6fa87ea6b3d90a375/scale_1200', 7]
  ]);

  await insertRows(db, `
    INSERT INTO tags (post_id, tag) VALUES (?, ?)
  `, [
    ['1', 'Парк'], ['1', 'Семейный отдых'], ['1', 'Озеро'],
    ['2', 'Культура'], ['2', 'Выставки'], ['2', 'История'],
    ['3', 'История'], ['3', 'Главные места'], ['3', 'События'],
    ['4', 'Главные места'], ['4', 'Администрация'], ['4', 'Донецк'],
    ['5', 'Отдых'], ['5', 'Отели'], ['5', 'Донецк'],
    ['6', 'Отдых'], ['6', 'Кофе'], ['6', 'Кафе'],
    ['7', 'Главные места'], ['7', 'Администрация'], ['7', 'Донецк']
  ]);

  await insertRows(db, `
    INSERT INTO working_hours (post_id, label, value) VALUES (?, ?, ?)
  `, [
    ['1', 'Пн - Пт', '08:00 - 23:00'],
    ['1', 'Сб - Вс', '10:00 - 01:00'],
    ['2', 'Пн - Пт', '09:00 - 20:00'],
    ['2', 'Сб - Вс', '10:00 - 22:00'],
    ['3', 'Ежедневно', 'Круглосуточно'],
    ['4', 'Ежедневно', 'Круглосуточно'],
    ['5', 'Пн - Вс', 'Круглосуточно'],
    ['6', 'Ежедневно', 'Круглосуточно'],
    ['7', 'Ежедневно', 'Круглосуточно']
  ]);

  await insertRows(db, `
    INSERT INTO reviews (id, post_id, author, comment, rating, date)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
    ['r1', '1', 'Екатерина', 'Люблю этот парк — особенно вечером, когда включают подсветку фонтанов.', 5, '12 мая 2024'],
    ['r2', '1', 'Максим', 'Хорошо оборудованные дорожки, много кафе. Единственный минус — многолюдно по выходным.', 4, '8 мая 2024'],
    ['r3', '2', 'Тёма', 'Отлично для изучения истории. Приветливый персонал и есть скидка студентам. Твердая пятерка!', 5, '9 мая 2025 год'],
    ['r4', '2', 'Ольга', 'Отличный музей. Обязательно посещу еще раз.', 4, '18 апреля 2024 год'],
    ['r5', '3', 'Сергей', 'Вечером невероятно красиво.', 5, '1 мая 2024'],
    ['r6', '3', 'Виктория', 'Невероятные фигуры.', 5, '22 апреля 2024'],
    ['r7', '4', 'Сергей', '', 5, '1 мая 2024'],
    ['r8', '4', 'Виктория', '', 5, '22 апреля 2024'],
    ['r9', '5', 'Тёма', '', 4, '11 мая 2025 год'],
    ['r10', '5', 'Ольга', 'Хороший отель', 5, '21 апреля 2024 год'],
    ['r11', '6', 'Даниил', 'Вкусный кофе', 5, '11 мая 2024'],
    ['r12', '6', 'Виктория', '', 4, '22 апреля 2024'],
    ['r13', '7', 'Сергей', '', 5, '1 мая 2024'],
    ['r14', '7', 'Виктория', '', 5, '22 апреля 2024']
  ]);

  await insertRows(db, `
    INSERT INTO contact_info (post_id, label, value, icon) VALUES (?, ?, ?, ?)
  `, [
    ['1', 'Официальный сайт', 'https://gorkiypark.com', 'globe-outline'],
    ['1', 'Телефон', '+7 (495) 995-00-20', 'call-outline'],
    ['1', 'Email', 'info@gorkiypark.com', 'mail-outline'],
    ['2', 'Официальный сайт', 'vov-museum-donetsk.ru', 'globe-outline'],
    ['2', 'Телефон', '+7 (495) 544-34-00', 'call-outline'],
    ['2', 'Email', 'info@vov.donetsk', 'mail-outline'],
    ['3', 'Сайт', 'https://kremlin.ru', 'globe-outline'],
    ['3', 'Телефон', '+7 (495) 620-65-65', 'call-outline'],
    ['3', 'Email', 'info@redsquare.ru', 'mail-outline'],
    ['4', 'Сайт', 'https://kremlin.ru', 'globe-outline'],
    ['4', 'Телефон', '+7 (495) 620-65-65', 'call-outline'],
    ['4', 'Email', 'donetsk@gov.ru', 'mail-outline'],
    ['5', 'Официальный сайт', 'vov-museum-donetsk.ru', 'globe-outline'],
    ['5', 'Телефон', '+7 (495) 544-34-00', 'call-outline'],
    ['5', 'Email', 'info@dn-palas', 'mail-outline'],
    ['6', 'Сайт', 'https://kremlin.ru', 'globe-outline'],
    ['6', 'Телефон', '+7 (495) 620-65-65', 'call-outline'],
    ['6', 'Email', 'info@redsquare.ru', 'mail-outline'],
    ['7', 'Сайт', 'https://kremlin.ru', 'globe-outline'],
    ['7', 'Телефон', '+7 (495) 620-65-65', 'call-outline'],
    ['7', 'Email', 'donetsk@gov.ru', 'mail-outline']
  ]);

  await insertRows(db, `
    INSERT INTO stories (id, userName, avatar, image, text, post_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
    ['s1', 'Парк Щербакова', 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/%D0%94%D0%BE%D0%BD%D0%B5%D1%86%D1%8C%D0%BA.JPG/1280px-%D0%94%D0%BE%D0%BD%D0%B5%D1%86%D1%8C%D0%BA.JPG', 'https://avatars.mds.yandex.net/i?id=fa5cefd9eeeb22774c6cfbed725c2522_l-4628278-images-thumbs&n=13', 'Скоро лето, а это значит что нужно посетить парк с вашими детьми. Ждем вас!', '1'],
    ['s2', 'Администрация Донецка', 'https://core-pht-proxy.maps.yandex.ru/v1/photos/download?photo_id=xPx2x_gogBtpwm7nBXtxWA&image_size=X5L', 'https://core-pht-proxy.maps.yandex.ru/v1/photos/download?photo_id=nuS_pBa3X0UKpszeOcdBgg&image_size=X5L', 'Продемонстрировали новое ночное освещение!', '4']
  ]);
};
