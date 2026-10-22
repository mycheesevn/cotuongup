// Bilingual Terms of Service / Privacy Policy content (English / Vietnamese).

import type { Lang } from "./i18n";

export interface LegalSection {
  heading: string;
  body: string[];
}

export interface LegalDoc {
  title: string;
  updated: string;
  intro: string[];
  sections: LegalSection[];
  back: string;
}

const CONTACT_EN =
  "If you have questions about these terms, you can reach the developer through the project's GitHub repository (mycheesevn/PacClone).";
const CONTACT_VI =
  "Nếu bạn có thắc mắc về các điều khoản này, bạn có thể liên hệ với nhà phát triển qua kho GitHub của dự án (mycheesevn/PacClone).";

export const TERMS: Record<Lang, LegalDoc> = {
  en: {
    title: "Terms of Service",
    updated: "Last updated: October 9, 2026",
    back: "← Back to game",
    intro: [
      "Welcome to Cờ Úp, our Dark Xiangqi (Jieqi) game. By accessing or using this website, you agree to these Terms of Service. If you do not agree, please do not use the service.",
    ],
    sections: [
      {
        heading: "1. The Service",
        body: [
          "We provide a free Dark Xiangqi (Cờ Úp) game you can play against the computer, including daily puzzles, game analysis, custom board setup, and cloud-saved game history for registered users. The service is provided for personal, non-commercial entertainment.",
        ],
      },
      {
        heading: "2. Accounts",
        body: [
          "You may play without an account. To save games to the cloud and sync progress across devices, you can create an account with an email address and password, or sign in with Google or Facebook.",
          "You are responsible for keeping your login credentials confidential and for all activity under your account. You must provide accurate information when registering and be at least 13 years old (or the minimum age required in your country).",
        ],
      },
      {
        heading: "3. Acceptable Use",
        body: [
          "You agree not to: disrupt or abuse the service; attempt to gain unauthorized access to other users' data; use bots or scrapers that degrade the service; or use the service for any unlawful purpose.",
          "Because this is a single-player game against the computer, 'cheating' only affects your own experience — but exploiting bugs to corrupt shared systems is still prohibited.",
        ],
      },
      {
        heading: "4. Your Game Data",
        body: [
          "Saved games, move histories, results, and puzzle progress associated with your account are stored so you can access them across devices. You can delete individual saved games at any time from the History tab.",
          "We may remove accounts or data that violate these terms or that have been inactive for an extended period.",
        ],
      },
      {
        heading: "5. Intellectual Property",
        body: [
          "The game's design, code, graphics, and sounds are owned by the developer and protected by applicable laws. You may not copy, redistribute, or create derivative works of the service without permission.",
          "Your own game records (the moves you played) remain yours; by using cloud saves you grant us the limited right to store and display them back to you.",
        ],
      },
      {
        heading: "6. Third-Party Services",
        body: [
          "The service relies on third parties such as Supabase (database and authentication), Google and Facebook (social sign-in), and Vercel (hosting). Your use of social sign-in is also subject to those providers' terms.",
        ],
      },
      {
        heading: "7. Disclaimer",
        body: [
          "The service is provided 'as is' without warranties of any kind. Computer opponent difficulty levels are approximate and engine evaluations are heuristic — they may occasionally be wrong. We do not guarantee uninterrupted or error-free operation.",
        ],
      },
      {
        heading: "8. Limitation of Liability",
        body: [
          "To the maximum extent permitted by law, the developer is not liable for any indirect, incidental, or consequential damages arising from your use of the service.",
        ],
      },
      {
        heading: "9. Changes",
        body: [
          "We may update these terms from time to time. Continued use of the service after changes take effect constitutes acceptance of the new terms.",
        ],
      },
      {
        heading: "10. Contact",
        body: [CONTACT_EN],
      },
    ],
  },
  vi: {
    title: "Điều khoản sử dụng",
    updated: "Cập nhật lần cuối: 9 tháng 10, 2026",
    back: "← Về trang game",
    intro: [
      "Chào mừng bạn đến với trò chơi Cờ Úp (Dark Xiangqi). Khi truy cập hoặc sử dụng website này, bạn đồng ý với các Điều khoản sử dụng dưới đây. Nếu không đồng ý, vui lòng không sử dụng dịch vụ.",
    ],
    sections: [
      {
        heading: "1. Dịch vụ",
        body: [
          "Chúng tôi cung cấp trò chơi Cờ Úp miễn phí để bạn chơi với máy tính, bao gồm thế cờ hằng ngày, phân tích ván cờ, tự sắp xếp bàn cờ và lưu lịch sử ván đấu trên đám mây cho người dùng đã đăng ký. Dịch vụ được cung cấp cho mục đích giải trí cá nhân, phi thương mại.",
        ],
      },
      {
        heading: "2. Tài khoản",
        body: [
          "Bạn có thể chơi mà không cần tài khoản. Để lưu ván cờ trên đám mây và đồng bộ tiến trình giữa các thiết bị, bạn có thể tạo tài khoản bằng email và mật khẩu, hoặc đăng nhập bằng Google hay Facebook.",
          "Bạn có trách nhiệm bảo mật thông tin đăng nhập và mọi hoạt động dưới tài khoản của mình. Bạn phải cung cấp thông tin chính xác khi đăng ký và từ đủ 13 tuổi trở lên (hoặc độ tuổi tối thiểu theo quy định tại quốc gia của bạn).",
        ],
      },
      {
        heading: "3. Sử dụng hợp lệ",
        body: [
          "Bạn đồng ý không: phá hoại hoặc lạm dụng dịch vụ; cố truy cập trái phép dữ liệu của người dùng khác; dùng bot hoặc công cụ quét dữ liệu làm ảnh hưởng dịch vụ; hoặc dùng dịch vụ cho mục đích bất hợp pháp.",
        ],
      },
      {
        heading: "4. Dữ liệu ván cờ của bạn",
        body: [
          "Các ván cờ đã lưu, lịch sử nước đi, kết quả và tiến trình giải thế cờ gắn với tài khoản của bạn được lưu trữ để bạn truy cập trên nhiều thiết bị. Bạn có thể xóa từng ván cờ đã lưu bất cứ lúc nào trong tab Lịch sử.",
          "Chúng tôi có thể xóa các tài khoản hoặc dữ liệu vi phạm điều khoản này hoặc không hoạt động trong thời gian dài.",
        ],
      },
      {
        heading: "5. Sở hữu trí tuệ",
        body: [
          "Thiết kế, mã nguồn, đồ họa và âm thanh của trò chơi thuộc sở hữu của nhà phát triển và được pháp luật bảo vệ. Bạn không được sao chép, phân phối lại hoặc tạo sản phẩm phái sinh từ dịch vụ nếu không được cho phép.",
        ],
      },
      {
        heading: "6. Dịch vụ bên thứ ba",
        body: [
          "Dịch vụ sử dụng các bên thứ ba như Supabase (cơ sở dữ liệu và xác thực), Google và Facebook (đăng nhập mạng xã hội), Vercel (lưu trữ web). Việc bạn dùng đăng nhập mạng xã hội cũng tuân theo điều khoản của các nhà cung cấp đó.",
        ],
      },
      {
        heading: "7. Tuyên bố miễn trừ",
        body: [
          "Dịch vụ được cung cấp 'nguyên trạng' mà không có bất kỳ bảo đảm nào. Các cấp độ khó của máy chỉ mang tính tương đối và đánh giá của engine chỉ là heuristic — đôi khi có thể không chính xác. Chúng tôi không đảm bảo dịch vụ hoạt động liên tục và không lỗi.",
        ],
      },
      {
        heading: "8. Giới hạn trách nhiệm",
        body: [
          "Trong phạm vi tối đa pháp luật cho phép, nhà phát triển không chịu trách nhiệm với bất kỳ thiệt hại gián tiếp, ngẫu nhiên hoặc hệ quả nào phát sinh từ việc bạn sử dụng dịch vụ.",
        ],
      },
      {
        heading: "9. Thay đổi điều khoản",
        body: [
          "Chúng tôi có thể cập nhật các điều khoản này theo thời gian. Việc tiếp tục sử dụng dịch vụ sau khi thay đổi có hiệu lực được coi là bạn chấp nhận điều khoản mới.",
        ],
      },
      {
        heading: "10. Liên hệ",
        body: [CONTACT_VI],
      },
    ],
  },
};

export const DATA_DELETION: Record<Lang, LegalDoc> = {
  en: {
    title: "User Data Deletion",
    updated: "Last updated: October 9, 2026",
    back: "← Back to game",
    intro: [
      "You can delete your data from our Dark Xiangqi (Cờ Úp) game at any time. This page explains how.",
    ],
    sections: [
      {
        heading: "1. Delete saved games yourself",
        body: [
          "Open the History tab (menu ☰ → History). There you can delete any saved game individually, and deletions take effect immediately.",
        ],
      },
      {
        heading: "2. Delete your entire account",
        body: [
          "To delete your account and all associated data (profile, saved games, puzzle progress), contact the developer through the project's GitHub repository (mycheesevn/PacClone) and request account deletion. Please include the email address you used to sign up.",
          "We will delete your account and all associated data within 30 days of receiving your request, and confirm once it is done.",
        ],
      },
      {
        heading: "3. What gets deleted",
        body: [
          "Your profile, email address, saved games (moves, results, settings), and puzzle streak/progress. Data is removed from our Supabase database. Anonymous technical logs kept by our hosting provider (Vercel) may persist briefly under their own retention policy.",
        ],
      },
      {
        heading: "4. Signed in with Facebook or Google?",
        body: [
          "Removing our app from your Facebook settings (Settings → Apps and Websites) or from your Google account revokes our access, but does not automatically delete data already stored with us. To delete that stored data, follow the steps above.",
        ],
      },
    ],
  },
  vi: {
    title: "Xóa dữ liệu người dùng",
    updated: "Cập nhật lần cuối: 9 tháng 10, 2026",
    back: "← Về trang game",
    intro: [
      "Bạn có thể xóa dữ liệu của mình khỏi trò chơi Cờ Úp (Dark Xiangqi) bất cứ lúc nào. Trang này hướng dẫn cách thực hiện.",
    ],
    sections: [
      {
        heading: "1. Tự xóa ván cờ đã lưu",
        body: [
          "Mở tab Lịch sử (menu ☰ → Lịch sử). Tại đây bạn có thể xóa từng ván cờ đã lưu, và việc xóa có hiệu lực ngay lập tức.",
        ],
      },
      {
        heading: "2. Xóa toàn bộ tài khoản",
        body: [
          "Để xóa tài khoản và toàn bộ dữ liệu liên quan (hồ sơ, ván cờ đã lưu, tiến trình giải thế cờ), hãy liên hệ với nhà phát triển qua kho GitHub của dự án (mycheesevn/PacClone) và yêu cầu xóa tài khoản. Vui lòng ghi rõ địa chỉ email bạn đã dùng để đăng ký.",
          "Chúng tôi sẽ xóa tài khoản và toàn bộ dữ liệu liên quan trong vòng 30 ngày kể từ khi nhận được yêu cầu, và xác nhận sau khi hoàn tất.",
        ],
      },
      {
        heading: "3. Những gì sẽ bị xóa",
        body: [
          "Hồ sơ, địa chỉ email, các ván cờ đã lưu (nước đi, kết quả, cài đặt) và chuỗi/tiến trình giải thế cờ của bạn. Dữ liệu được xóa khỏi cơ sở dữ liệu Supabase của chúng tôi. Các nhật ký kỹ thuật ẩn danh của nhà cung cấp hosting (Vercel) có thể còn lưu trong thời gian ngắn theo chính sách của họ.",
        ],
      },
      {
        heading: "4. Đăng nhập bằng Facebook hoặc Google?",
        body: [
          "Việc gỡ ứng dụng của chúng tôi khỏi cài đặt Facebook (Cài đặt → Ứng dụng và trang web) hoặc khỏi tài khoản Google chỉ thu hồi quyền truy cập, không tự động xóa dữ liệu đã lưu chỗ chúng tôi. Để xóa dữ liệu đó, hãy làm theo các bước trên.",
        ],
      },
    ],
  },
};

export const PRIVACY: Record<Lang, LegalDoc> = {
  en: {
    title: "Privacy Policy",
    updated: "Last updated: October 9, 2026",
    back: "← Back to game",
    intro: [
      "This Privacy Policy explains what data we collect when you use our Dark Xiangqi (Cờ Úp) game and how we use it.",
    ],
    sections: [
      {
        heading: "1. Data We Collect",
        body: [
          "Account data: if you register, we store your email address and an encrypted password, or the basic profile information (name, email) provided by Google or Facebook when you use social sign-in.",
          "Game data: saved games (moves, results, settings such as difficulty level and time control) and daily puzzle progress linked to your account.",
          "Device preferences: language choice, sound on/off, stored locally in your browser (localStorage) and never sent to our servers.",
          "We do not collect your precise location, contacts, or any data unrelated to the game.",
        ],
      },
      {
        heading: "2. How We Use Your Data",
        body: [
          "We use your data only to operate the service: authenticating you, saving and syncing your games and progress across devices, and remembering your preferences.",
          "We do not sell your data, show third-party ads, or use your data for advertising.",
        ],
      },
      {
        heading: "3. Third Parties",
        body: [
          "Supabase hosts our database and authentication — your account and game data are stored on Supabase infrastructure.",
          "Google and Facebook are used solely as sign-in providers; we receive only the basic profile data needed to create your account.",
          "Vercel hosts this website and may process standard technical logs (such as IP addresses) to deliver the pages.",
          "Google Analytics helps us understand where visitors come from and how the site is used, so we can improve it; it sets analytics cookies (such as _ga). We do not use advertising cookies, and analytics data is not sold.",
        ],
      },
      {
        heading: "4. Data Retention and Deletion",
        body: [
          "You can delete individual saved games at any time in the History tab. If you want your account and all associated data deleted, contact the developer (see below) and we will remove it.",
          "We retain data only for as long as needed to provide the service.",
        ],
      },
      {
        heading: "5. Security",
        body: [
          "Passwords are stored encrypted, connections use HTTPS, and database access is restricted so users can only read and modify their own data. No system is perfectly secure, but we take reasonable measures to protect your information.",
        ],
      },
      {
        heading: "6. Children",
        body: [
          "The service is not directed at children under 13. If you believe a child has provided us personal data, contact us and we will delete it.",
        ],
      },
      {
        heading: "7. Changes",
        body: [
          "We may update this policy from time to time. Continued use of the service after changes take effect constitutes acceptance of the new policy.",
        ],
      },
      {
        heading: "8. Contact",
        body: [CONTACT_EN],
      },
    ],
  },
  vi: {
    title: "Chính sách bảo mật",
    updated: "Cập nhật lần cuối: 9 tháng 10, 2026",
    back: "← Về trang game",
    intro: [
      "Chính sách bảo mật này giải thích dữ liệu nào chúng tôi thu thập khi bạn chơi Cờ Úp (Dark Xiangqi) và cách chúng tôi sử dụng chúng.",
    ],
    sections: [
      {
        heading: "1. Dữ liệu chúng tôi thu thập",
        body: [
          "Dữ liệu tài khoản: nếu bạn đăng ký, chúng tôi lưu địa chỉ email và mật khẩu đã mã hóa, hoặc thông tin hồ sơ cơ bản (tên, email) do Google hoặc Facebook cung cấp khi bạn đăng nhập mạng xã hội.",
          "Dữ liệu ván cờ: các ván cờ đã lưu (nước đi, kết quả, cài đặt như cấp độ khó và thời gian) và tiến trình giải thế cờ hằng ngày gắn với tài khoản của bạn.",
          "Tùy chọn trên thiết bị: ngôn ngữ, bật/tắt âm thanh, được lưu trong trình duyệt của bạn (localStorage) và không bao giờ gửi về máy chủ của chúng tôi.",
          "Chúng tôi không thu thập vị trí chính xác, danh bạ hay bất kỳ dữ liệu nào không liên quan đến trò chơi.",
        ],
      },
      {
        heading: "2. Cách chúng tôi dùng dữ liệu",
        body: [
          "Chúng tôi chỉ dùng dữ liệu của bạn để vận hành dịch vụ: xác thực, lưu và đồng bộ ván cờ cùng tiến trình giữa các thiết bị, và ghi nhớ tùy chọn của bạn.",
          "Chúng tôi không bán dữ liệu của bạn, không hiển thị quảng cáo của bên thứ ba và không dùng dữ liệu của bạn cho quảng cáo.",
        ],
      },
      {
        heading: "3. Bên thứ ba",
        body: [
          "Supabase lưu trữ cơ sở dữ liệu và hệ thống xác thực — tài khoản và dữ liệu ván cờ của bạn được lưu trên hạ tầng của Supabase.",
          "Google và Facebook chỉ được dùng làm nhà cung cấp đăng nhập; chúng tôi chỉ nhận thông tin hồ sơ cơ bản cần thiết để tạo tài khoản cho bạn.",
          "Vercel lưu trữ website này và có thể xử lý các nhật ký kỹ thuật tiêu chuẩn (như địa chỉ IP) để phân phối trang web.",
          "Google Analytics giúp chúng tôi hiểu khách truy cập đến từ đâu và cách họ sử dụng trang web để cải thiện dịch vụ; công cụ này đặt cookie phân tích (như _ga). Chúng tôi không dùng cookie quảng cáo và không bán dữ liệu phân tích.",
        ],
      },
      {
        heading: "4. Lưu trữ và xóa dữ liệu",
        body: [
          "Bạn có thể xóa từng ván cờ đã lưu bất cứ lúc nào trong tab Lịch sử. Nếu muốn xóa tài khoản và toàn bộ dữ liệu liên quan, hãy liên hệ với nhà phát triển (xem bên dưới) và chúng tôi sẽ xóa chúng.",
          "Chúng tôi chỉ lưu giữ dữ liệu trong thời gian cần thiết để cung cấp dịch vụ.",
        ],
      },
      {
        heading: "5. Bảo mật",
        body: [
          "Mật khẩu được lưu trữ đã mã hóa, kết nối dùng HTTPS, và quyền truy cập cơ sở dữ liệu bị giới hạn để người dùng chỉ đọc và sửa dữ liệu của chính mình. Không hệ thống nào an toàn tuyệt đối, nhưng chúng tôi áp dụng các biện pháp hợp lý để bảo vệ thông tin của bạn.",
        ],
      },
      {
        heading: "6. Trẻ em",
        body: [
          "Dịch vụ không hướng đến trẻ em dưới 13 tuổi. Nếu bạn cho rằng một trẻ em đã cung cấp dữ liệu cá nhân cho chúng tôi, hãy liên hệ và chúng tôi sẽ xóa dữ liệu đó.",
        ],
      },
      {
        heading: "7. Thay đổi chính sách",
        body: [
          "Chúng tôi có thể cập nhật chính sách này theo thời gian. Việc tiếp tục sử dụng dịch vụ sau khi thay đổi có hiệu lực được coi là bạn chấp nhận chính sách mới.",
        ],
      },
      {
        heading: "8. Liên hệ",
        body: [CONTACT_VI],
      },
    ],
  },
};
