import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';

const modalTranslations = {
  "en": {
    "customerTitle": "Account not found",
    "agentTitle": "Professional account not found",
    "descPrefix": "No registered account matching",
    "descSuffix": "was found. Select how you'd like to proceed:",
    "descGeneralCustomer": "No matching customer account credentials found in the database. Select how you would like to proceed:",
    "descGeneralAgent": "No matching professional credentials found in the database. Select how you would like to proceed:",
    "createAccountTitle": "Create a New Account",
    "createAccountSub": "Fast registration with email, mobile & date of birth",
    "registerPartnerTitle": "Register as Professional",
    "registerPartnerSub": "Sign up with trade domain, experience & location in 1 min",
    "tryAnotherTitle": "Try Another Mobile Number",
    "tryAnotherSub": "Return to sign-in form to fix a typo or enter another number",
    "autoDismissPrefix": "Auto-dismissing in",
    "dismissBtn": "Dismiss"
  },
  "hi": {
    "customerTitle": "खाता नहीं मिला",
    "agentTitle": "प्रोफेशनल खाता नहीं मिला",
    "descPrefix": "दर्ज विवरण",
    "descSuffix": "से मेल खाने वाला कोई पंजीकृत खाता नहीं मिला। कृपया आगे बढ़ने के लिए विकल्प चुनें:",
    "descGeneralCustomer": "डेटाबेस में कोई पंजीकृत ग्राहक खाता नहीं मिला। कृपया आगे बढ़ने का विकल्प चुनें:",
    "descGeneralAgent": "डेटाबेस में कोई पंजीकृत प्रोफेशनल खाता नहीं मिला। कृपया आगे बढ़ने का विकल्प चुनें:",
    "createAccountTitle": "नया खाता बनाएं",
    "createAccountSub": "ईमेल, मोबाइल और जन्म तिथि के साथ त्वरित पंजीकरण",
    "registerPartnerTitle": "प्रोफेशनल के रूप में पंजीकरण करें",
    "registerPartnerSub": "1 मिनट में ट्रेड, अनुभव और लोकेशन के साथ साइन अप करें",
    "tryAnotherTitle": "दूसरा मोबाइल नंबर आज़माएं",
    "tryAnotherSub": "टाइपो सुधारने या दूसरा नंबर दर्ज करने के लिए वापस जाएं",
    "autoDismissPrefix": "स्वतः बंद हो रहा है",
    "dismissBtn": "बंद करें"
  },
  "mr": {
    "customerTitle": "खाते आढळले नाही",
    "agentTitle": "प्रोफेशनल खाते आढळले नाही",
    "descPrefix": "नोंदणीकृत तपशील",
    "descSuffix": "शी जुळणारे कोणतेही खाते आढळले नाही. कृपया पुढे जाण्यासाठी पर्याय निवडा:",
    "descGeneralCustomer": "डेटाबेसमध्ये कोणतेही नोंदणीकृत खाते आढळले नाही. कृपया पुढे जाण्यासाठी पर्याय निवडा:",
    "descGeneralAgent": "डेटाबेसमध्ये कोणतेही नोंदणीकृत प्रोफेशनल खाते आढळले नाही. कृपया पुढे जाण्यासाठी पर्याय निवडा:",
    "createAccountTitle": "नवीन खाते तयार करा",
    "createAccountSub": "ईमेल, मोबाईल आणि जन्मतारीखसह जलद नोंदणी",
    "registerPartnerTitle": "प्रोफेशनल म्हणून नोंदणी करा",
    "registerPartnerSub": "1 मिनिटात व्यवसाय, अनुभव आणि स्थानासह साइन अप करा",
    "tryAnotherTitle": "दुसरा मोबाईल नंबर वापरा",
    "tryAnotherSub": "टायपो सुधारण्यासाठी किंवा दुसरा नंबर प्रविष्ट करण्यासाठी परत जा",
    "autoDismissPrefix": "आपोआप बंद होत आहे",
    "dismissBtn": "रद्द करा"
  },
  "bn": {
    "customerTitle": "অ্যাকাউন্ট পাওয়া যায়নি",
    "agentTitle": "প্রফেশনাল অ্যাকাউন্ট পাওয়া যায়নি",
    "descPrefix": "প্রদত্ত বিবরণ",
    "descSuffix": "এর সাথে মিল থাকা কোনো নিবন্ধিত অ্যাকাউন্ট পাওয়া যায়নি। অনুগ্রহ করে একটি বিকল্প বেছে নিন:",
    "descGeneralCustomer": "ডাটাবেসে কোনো নিবন্ধিত গ্রাহক অ্যাকাউন্ট পাওয়া যায়নি। অনুগ্রহ করে একটি বিকল্প বেছে নিন:",
    "descGeneralAgent": "ডাটাবেসে কোনো নিবন্ধিত প্রফেশনাল অ্যাকাউন্ট পাওয়া যায়নি। অনুগ্রহ করে একটি বিকল্প বেছে নিন:",
    "createAccountTitle": "নতুন অ্যাকাউন্ট তৈরি করুন",
    "createAccountSub": "ইমেল, মোবাইল এবং জন্মতারিখ দিয়ে দ্রুত নিবন্ধন করুন",
    "registerPartnerTitle": "প্রফেশনাল হিসেবে নিবন্ধন করুন",
    "registerPartnerSub": "১ মিনিটে ট্রেড, অভিজ্ঞতা ও লোকেশন দিয়ে সাইন আপ করুন",
    "tryAnotherTitle": "অন্য মোবাইল নম্বর ব্যবহার করুন",
    "tryAnotherSub": "ভুল সংশোধন করতে বা অন্য নম্বর লিখতে ফিরে যান",
    "autoDismissPrefix": "স্বয়ংক্রিয়ভাবে বন্ধ হচ্ছে",
    "dismissBtn": "বাতিল করুন"
  },
  "ta": {
    "customerTitle": "கணக்கு காணப்படவில்லை",
    "agentTitle": "புரொபஷனல் கணக்கு காணப்படவில்லை",
    "descPrefix": "உள்ளிடப்பட்ட விவரங்கள்",
    "descSuffix": "உடன் பொருந்தும் கணக்கு எதுவும் காணப்படவில்லை. தொடர ஒரு விருப்பத்தைத் தேர்ந்தெடுக்கவும்:",
    "descGeneralCustomer": "தரவுத்தளத்தில் பொருந்தும் வாடிக்கையாளர் கணக்கு எதுவும் காணப்படவில்லை. தொடர ஒரு விருப்பத்தைத் தேர்ந்தெடுக்கவும்:",
    "descGeneralAgent": "தரவுத்தளத்தில் பொருந்தும் புரொபஷனல் கணக்கு எதுவும் காணப்படவில்லை. தொடர ஒரு விருப்பத்தைத் தேர்ந்தெடுக்கவும்:",
    "createAccountTitle": "புதிய கணக்கை உருவாக்கவும்",
    "createAccountSub": "மின்னஞ்சல், மொபைல் மற்றும் பிறந்த தேதியுடன் விரைவான பதிவு",
    "registerPartnerTitle": "புரொபஷனலாக பதிவு செய்க",
    "registerPartnerSub": "1 நிமிடத்தில் தொழில், அனுபவம் மற்றும் இருப்பிடத்துடன் பதிவு செய்யவும்",
    "tryAnotherTitle": "மற்றொரு மொபைல் எண்ணை முயற்சிக்கவும்",
    "tryAnotherSub": "எழுத்துப் பிழையைச் சரிசெய்ய அல்லது மற்றொரு எண்ணை உள்ளிட திரும்பிச் செல்லவும்",
    "autoDismissPrefix": "தானாக மூடப்படுகிறது",
    "dismissBtn": "ரத்து செய்"
  },
  "te": {
    "customerTitle": "ఖాతా కనుగొనబడలేదు",
    "agentTitle": "ప్రొఫెషనల్ ఖాతా కనుగొనబడలేదు",
    "descPrefix": "నమోదు చేసిన వివరాలు",
    "descSuffix": "తో సరిపోలే ఖాతా ఏదీ కనుగొనబడలేదు. కొనసాగడానికి ఒక ఎంపికను ఎంచుకోండి:",
    "descGeneralCustomer": "డేటాబేస్‌లో సరిపోలే కస్టమర్ ఖాతా ఏదీ కనుగొనబడలేదు. కొనసాగడానికి ఒక ఎంపికను ఎంచుకోండి:",
    "descGeneralAgent": "డేటాబేస్‌లో సరిపోలే ప్రొఫెషనల్ ఖాతా ఏదీ కనుగొనబడలేదు. కొనసాగడానికి ఒక ఎంపికను ఎంచుకోండి:",
    "createAccountTitle": "కొత్త ఖాతాను సృష్టించండి",
    "createAccountSub": "ఈమెయిల్, మొబైల్ మరియు పుట్టిన తేదీతో వేగవంతమైన నమోదు",
    "registerPartnerTitle": "ప్రొఫెషనల్‌గా నమోదు చేసుకోండి",
    "registerPartnerSub": "1 నిమిషంలో వృత్తి, అనుభవం మరియు ప్రదేశంతో సైన్ అప్ చేయండి",
    "tryAnotherTitle": "మరొక మొబైల్ నంబర్‌ను ప్రయత్నించండి",
    "tryAnotherSub": "తప్పును సరిదిద్దడానికి లేదా మరొక నంబర్‌ను నమోదు చేయడానికి తిరిగి వెళ్ళండి",
    "autoDismissPrefix": "స్వయంచాలకంగా మూసివేయబడుతోంది",
    "dismissBtn": "రద్దు చేయి"
  },
  "kn": {
    "customerTitle": "ಖಾತೆ ಕಂಡುಬಂದಿಲ್ಲ",
    "agentTitle": "ಪ್ರೊಫೆಷನಲ್ ಖಾತೆ ಕಂಡುಬಂದಿಲ್ಲ",
    "descPrefix": "ನಮೂದಿಸಿದ ವಿವರಗಳು",
    "descSuffix": "ಗೆ ಹೊಂದಿಕೆಯಾಗುವ ಯಾವುದೇ ಖಾತೆ ಕಂಡುಬಂದಿಲ್ಲ. ಮುಂದುವರಿಯಲು ಆಯ್ಕೆಯನ್ನು ಆರಿಸಿ:",
    "descGeneralCustomer": "ಡೇಟಾಬೇಸ್‌ನಲ್ಲಿ ಯಾವುದೇ ಹೊಂದಾಣಿಕೆಯಾಗುವ ಗ್ರಾಹಕ ಖಾತೆ ಕಂಡುಬಂದಿಲ್ಲ. ಮುಂದುವರಿಯಲು ಆಯ್ಕೆಯನ್ನು ಆರಿಸಿ:",
    "descGeneralAgent": "ಡೇಟಾಬೇಸ್‌ನಲ್ಲಿ ಯಾವುದೇ ಹೊಂದಾಣಿಕೆಯಾಗುವ ಪ್ರೊಫೆಷನಲ್ ಖಾತೆ ಕಂಡುಬಂದಿಲ್ಲ. ಮುಂದುವರಿಯಲು ಆಯ್ಕೆಯನ್ನು ಆರಿಸಿ:",
    "createAccountTitle": "ಹೊಸ ಖಾತೆಯನ್ನು ರಚಿಸಿ",
    "createAccountSub": "ಇಮೇಲ್, ಮೊಬೈಲ್ ಮತ್ತು ಹುಟ್ಟಿದ ದಿನಾಂಕದೊಂದಿಗೆ ತ್ವರಿತ ನೋಂದಣಿ",
    "registerPartnerTitle": "ಪ್ರೊಫೆಷನಲ್ ಆಗಿ ನೋಂದಾಯಿಸಿ",
    "registerPartnerSub": "1 ನಿಮಿಷದಲ್ಲಿ ವೃತ್ತಿ, ಅನುಭವ ಮತ್ತು ಸ್ಥಳದೊಂದಿಗೆ ಸೈನ್ ಅಪ್ ಮಾಡಿ",
    "tryAnotherTitle": "ಮತ್ತೊಂದು ಮೊಬೈಲ್ ಸಂಖ್ಯೆಯನ್ನು ಪ್ರಯತ್ನಿಸಿ",
    "tryAnotherSub": "ತಪ್ಪನ್ನು ಸರಿಪಡಿಸಲು ಅಥವಾ ಇನ್ನೊಂದು ಸಂಖ್ಯೆಯನ್ನು ನಮೂದಿಸಲು ಹಿಂತಿರುಗಿ",
    "autoDismissPrefix": "ಸ್ವಯಂಚಾಲಿತವಾಗಿ ಮುಚ್ಚಲಾಗುತ್ತಿದೆ",
    "dismissBtn": "ರದ್ದುಮಾಡಿ"
  },
  "ur": {
    "customerTitle": "اکاؤنٹ نہیں ملا",
    "agentTitle": "پروفیشنل اکاؤنٹ نہیں ملا",
    "descPrefix": "درج کردہ تفصیلات",
    "descSuffix": "سے مماثل کوئی رجسٹرڈ اکاؤنٹ نہیں ملا۔ آگے بڑھنے کے لیے ایک آپشن منتخب کریں:",
    "descGeneralCustomer": "ڈیٹا بیس میں کوئی مماثل کسٹمر اکاؤنٹ نہیں ملا۔ آگے بڑھنے کے لیے آپشن منتخب کریں:",
    "descGeneralAgent": "ڈیٹا بیس میں کوئی مماثل پروفیشنل اکاؤنٹ نہیں ملا۔ آگے بڑھنے کے لیے آپشن منتخب کریں:",
    "createAccountTitle": "نیا اکاؤنٹ بنائیں",
    "createAccountSub": "ای میل، موبائل اور تاریخ پیدائش کے ساتھ فوری رجسٹریشن",
    "registerPartnerTitle": "پروفیشنل کے طور پر رجسٹر کریں",
    "registerPartnerSub": "1 منٹ میں ٹریڈ، تجربہ اور مقام کے ساتھ سائن اپ کریں",
    "tryAnotherTitle": "دوسرا موبائل نمبر آزمائیں",
    "tryAnotherSub": "غلطی درست کرنے یا دوسرا نمبر درج کرنے کے لیے واپس جائیں",
    "autoDismissPrefix": "خودکار طریقے سے بند ہو رہا ہے",
    "dismissBtn": "خارج کریں"
  },
  "gu": {
    "customerTitle": "ખાતું મળ્યું નથી",
    "agentTitle": "પ્રોફેશનલ ખાતું મળ્યું નથી",
    "descPrefix": "દાખલ કરેલ વિગતો",
    "descSuffix": "સાથે મેળ ખાતું કોઈ ખાતું મળ્યું નથી. આગળ વધવા માટે વિકલ્પ પસંદ કરો:",
    "descGeneralCustomer": "ડેટાબેઝમાં કોઈ મેળ ખાતું ગ્રાહક ખાતું મળ્યું નથી. આગળ વધવા માટે વિકલ્પ પસંદ કરો:",
    "descGeneralAgent": "ડેટાબેઝમાં કોઈ મેળ ખાતું પ્રોફેશનલ ખાતું મળ્યું નથી. આગળ વધવા માટે વિકલ્પ પસંદ કરો:",
    "createAccountTitle": "નવું ખાતું બનાવો",
    "createAccountSub": "ઇમેઇલ, મોબાઇલ અને જન્મ તારીખ સાથે ઝડપી નોંધણી",
    "registerPartnerTitle": "પ્રોફેશનલ તરીકે નોંધણી કરો",
    "registerPartnerSub": "1 મિનિટમાં વ્યવસાય, અનુભવ અને સ્થાન સાથે સાઇન અપ કરો",
    "tryAnotherTitle": "બીજો મોબાઇલ નંબર અજમાવો",
    "tryAnotherSub": "ભૂલ સુધારવા અથવા બીજો નંબર દાખલ કરવા પાછા જાઓ",
    "autoDismissPrefix": "આપમેળે બંધ થઈ રહ્યું છે",
    "dismissBtn": "રદ કરો"
  },
  "pa": {
    "customerTitle": "ਖਾਤਾ ਨਹੀਂ ਮਿਲਿਆ",
    "agentTitle": "ਪ੍ਰੋਫੈਸ਼ਨਲ ਖਾਤਾ ਨਹੀਂ ਮਿਲਿਆ",
    "descPrefix": "ਦਰਜ ਕੀਤੇ ਵੇਰਵੇ",
    "descSuffix": "ਨਾਲ ਮੇਲ ਖਾਂਦਾ ਕੋਈ ਖਾਤਾ ਨਹੀਂ ਮਿਲਿਆ। ਕਿਰਪਾ ਕਰਕੇ ਅੱਗੇ ਵਧਣ ਲਈ ਵਿਕਲਪ ਚੁਣੋ:",
    "descGeneralCustomer": "ਡੇਟਾਬੇਸ ਵਿੱਚ ਕੋਈ ਮੇਲ ਖਾਂਦਾ ਗਾਹਕ ਖਾਤਾ ਨਹੀਂ ਮਿਲਿਆ। ਕਿਰਪਾ ਕਰਕੇ ਅੱਗੇ ਵਧਣ ਲਈ ਵਿਕਲਪ ਚੁਣੋ:",
    "descGeneralAgent": "ਡੇਟਾਬੇਸ ਵਿੱਚ ਕੋਈ ਮੇਲ ਖਾਂਦਾ ਪ੍ਰੋਫੈਸ਼ਨਲ ਖਾਤਾ ਨਹੀਂ ਮਿਲਿਆ। ਕਿਰਪਾ ਕਰਕੇ ਅੱਗੇ ਵਧਣ ਲਈ ਵਿਕਲਪ ਚੁਣੋ:",
    "createAccountTitle": "ਨਵਾਂ ਖਾਤਾ ਬਣਾਓ",
    "createAccountSub": "ਈਮੇਲ, ਮੋਬਾਈਲ ਅਤੇ ਜਨਮ ਮਿਤੀ ਨਾਲ ਤੇਜ਼ ਰਜਿਸਟ੍ਰੇਸ਼ਨ",
    "registerPartnerTitle": "ਪ੍ਰੋਫੈਸ਼ਨਲ ਵਜੋਂ ਰਜਿਸਟਰ ਕਰੋ",
    "registerPartnerSub": "1 ਮਿੰਟ ਵਿੱਚ ਵਪਾਰ, ਤਜਰਬਾ ਅਤੇ ਸਥਾਨ ਨਾਲ ਸਾਈਨ ਅੱਪ ਕਰੋ",
    "tryAnotherTitle": "ਦੂਜਾ ਮੋਬਾਈਲ ਨੰਬਰ ਅਜ਼ਮਾਓ",
    "tryAnotherSub": "ਗਲਤੀ ਠੀਕ ਕਰਨ ਜਾਂ ਦੂਜਾ ਨੰਬਰ ਦਰਜ ਕਰਨ ਲਈ ਵਾਪਸ ਜਾਓ",
    "autoDismissPrefix": "ਆਪਣੇ ਆਪ ਬੰਦ ਹੋ ਰਿਹਾ ਹੈ",
    "dismissBtn": "ਰੱਦ ਕਰੋ"
  }
};

export default function AccountNotFoundModal({
  isOpen,
  role = 'customer',
  identifier = '',
  onRedirectToSignUp,
  onClose,
  duration = 10
}) {
  const [secondsLeft, setSecondsLeft] = useState(duration);
  const { activeLanguage } = useLanguage();

  const langKey = modalTranslations[activeLanguage] ? activeLanguage : 'en';
  const loc = modalTranslations[langKey];

  useEffect(() => {
    let interval = null;
    if (isOpen) {
      setSecondsLeft(duration);
      interval = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            onClose();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isOpen, duration, onClose]);

  if (!isOpen) return null;

  const isAgent = role === 'agent';
  const progressPercent = ((duration - secondsLeft) / duration) * 100;

  return (
    <div className="uber-lang-modal-backdrop open" onClick={onClose}>
      <div
        className="uber-lang-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Account Not Found"
        style={{
          position: 'relative',
          maxWidth: '560px'
        }}
      >
        {/* Linear Countdown Progress Bar at the very top */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '3px',
            background: '#e7e2d8'
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${100 - progressPercent}%`,
              background: 'var(--accent-luxe, #a9793c)',
              transition: 'width 1s linear'
            }}
          />
        </div>

        {/* Modal Header */}
        <div className="uber-lang-modal-header">
          <div className="uber-lang-modal-title">
            {isAgent ? loc.agentTitle : loc.customerTitle}
          </div>
          <button
            type="button"
            className="uber-lang-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Informative Subtitle Notice */}
        <div style={{ padding: '1.15rem 1.75rem 0.5rem', color: 'var(--text-secondary, #5a5648)', fontSize: '0.92rem', lineHeight: 1.5 }}>
          {identifier ? (
            <>
              {loc.descPrefix} <strong style={{ color: 'var(--text-primary, #14181f)' }}>{identifier}</strong> {loc.descSuffix}
            </>
          ) : (
            isAgent ? loc.descGeneralAgent : loc.descGeneralCustomer
          )}
        </div>

        {/* Option Cards Grid matching the Reference Design */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            padding: '1rem 1.75rem 1.25rem'
          }}
        >
          {/* Option 1: Create Account / Register (Highlighted Primary Card) */}
          <button
            type="button"
            className="uber-lang-item active"
            onClick={onRedirectToSignUp}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem 1.25rem',
              width: '100%',
              border: '2px solid var(--accent-luxe, #a9793c)',
              background: 'rgba(169, 121, 60, 0.08)',
              borderRadius: '12px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.18s ease'
            }}
          >
            <div className="uber-lang-names">
              <span className="uber-lang-native" style={{ fontSize: '1.05rem', color: 'var(--text-primary, #14181f)' }}>
                {isAgent ? loc.registerPartnerTitle : loc.createAccountTitle}
              </span>
              <span className="uber-lang-english" style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #5a5648)', marginTop: '0.2rem' }}>
                {isAgent ? loc.registerPartnerSub : loc.createAccountSub}
              </span>
            </div>

            <div className="uber-lang-checkmark" style={{ color: 'var(--accent-luxe, #a9793c)', display: 'flex', alignItems: 'center' }}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </div>
          </button>

          {/* Option 2: Try Another Credential / Dismiss */}
          <button
            type="button"
            className="uber-lang-item"
            onClick={onClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.95rem 1.25rem',
              width: '100%',
              borderRadius: '12px',
              cursor: 'pointer',
              textAlign: 'left'
            }}
          >
            <div className="uber-lang-names">
              <span className="uber-lang-native" style={{ fontSize: '1rem', color: 'var(--text-primary, #14181f)' }}>
                {loc.tryAnotherTitle}
              </span>
              <span className="uber-lang-english" style={{ fontSize: '0.82rem', color: 'var(--text-secondary, #5a5648)' }}>
                {loc.tryAnotherSub}
              </span>
            </div>

            <div style={{ color: 'var(--text-secondary, #7a7568)' }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10"></polyline>
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
              </svg>
            </div>
          </button>
        </div>

        {/* Modal Footer with Auto-Dismiss Timer */}
        <div
          style={{
            padding: '0.75rem 1.75rem 1.25rem',
            borderTop: '1px solid rgba(16, 24, 32, 0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.82rem',
            color: 'var(--text-muted, #9a9484)'
          }}
        >
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: 'var(--accent-luxe, #a9793c)',
                display: 'inline-block'
              }}
            />
            <span>{loc.autoDismissPrefix} <strong>{secondsLeft}s</strong></span>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary, #5a5648)',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            {loc.dismissBtn}
          </button>
        </div>
      </div>
    </div>
  );
}
