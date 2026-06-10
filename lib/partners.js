/**
 * Cấu hình affiliate / partner liên kết với xoso66tv.com
 * Sửa các URL ở đây để đổi link mời gọi, banner, deep-link.
 */
module.exports = {
  brand: {
    name:    'XOSO66 TV',
    short:   'XOSO66 TV',
    tagline: 'Trực tiếp thể thao - Casino - Idol',
    domain:  'xoso66tv.com',
    logoText: 'XOSO66',
  },
  partner: {
    home:        'https://xoso66tv.com',
    register:    'https://qt99.click',
    login:       'https://qt99.click',
    download:    'https://qt99.click',
    sportbet:    'https://qt99.click',
    casino:      'https://qt99.click',
    idol:        'https://qt99.click',
    minigame:    'https://qt99.click',
    promo:       'https://qt99.click',
    gift:        'https://qt99.click',
    cskh:        'https://qt99.click',
    telegram:    'https://t.me/xoso66tv',
  },
  banners: [
    {
      title:  'VÉ CƯỢC THUA THỂ THAO ĐẦU TIÊN',
      desc:   'Hoàn 100% tối đa 5.000.000đ cho vé cược thua đầu tiên',
      cta:    'Nhận ngay',
      url:    'https://qt99.click',
      bg:     'linear-gradient(90deg,#c0392b,#e67e22,#f1c40f)',
    },
    {
      title:  'NẠP LẦN ĐẦU - THƯỞNG 100%',
      desc:   'Nhận thêm 1.000.000đ khi nạp tiền lần đầu tiên',
      cta:    'Nạp ngay',
      url:    'https://qt99.click',
      bg:     'linear-gradient(90deg,#1e8449,#27ae60,#f1c40f)',
    },
    {
      title:  'IDOL LIVE 24/7 - HOTGIRL ĐỘC QUYỀN',
      desc:   'Hàng trăm idol xinh đẹp đang chờ bạn trong phòng riêng',
      cta:    'Vào phòng',
      url:    'https://qt99.click',
      bg:     'linear-gradient(90deg,#8e44ad,#e91e63,#f1c40f)',
    },
  ],
  paymentMethods: ['Momo','ZaloPay','VietQR','ViettelPay','Internet Banking','USDT'],
};
