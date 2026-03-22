const translations = {
    en: {
        'nav_home': 'Home',
        'nav_grades': 'Grades',
        'nav_dashboard': 'Dashboard',
        'nav_admin': 'Admin Panel',
        'nav_login': 'Login',
        'nav_register': 'Register',
        'nav_logout': 'Logout',
        'hero_title': 'Unlock Your Learning Journey',
        'hero_subtitle': 'Premium educational video content tailored for all grades. Earn coins, unlock knowledge, and track your progress.',
        'btn_start': 'Get Started',
        'btn_grade1': 'Grade 1',
        'btn_grade2': 'Grade 2',
        'btn_grade3': 'Grade 3',
        'coins_balance': 'Coins Balance:',
        'redeem_code': 'Redeem Code',
        'enter_code': 'Enter 8-character code',
        'btn_redeem': 'Redeem',
        'unlock_video': 'Unlock for 1 Coin',
        'play_video': 'Play Video',
        'locked': 'Locked',
        'unlocked': 'Unlocked',
        'login_title': 'Welcome Back',
        'register_title': 'Create Account',
        'email': 'Email Address',
        'password': 'Password',
        'name': 'Full Name',
        'admin_generate': 'Generate 500 Codes',
        'admin_print': 'Print Codes',
        'stats_total_codes': 'Total Codes',
        'stats_used_codes': 'Used Codes',
        'dev_title': 'Platform Developer',
        'dev_name': 'Keryakos Alkis',
        'dev_role': 'Full Stack Developer & DevOps Engineer',
        'dev_desc': 'A passionate software developer specializing in building scalable web and mobile applications. Experienced in Flutter development, backend systems, cloud deployment, and DevOps practices. Focused on creating high-performance applications and reliable infrastructure that deliver seamless user experiences.',
        'dev_skill1': 'Developer',
        'dev_skill2': 'DevOps',
        'dev_skill3': 'System Infrastructure',
        'nav_live_exams': '⏳ Live Exams',
        'nav_messages': '📩 Messages',
        'msg_title': '📬 Your Messages'
    },
    ar: {
        'nav_home': 'الرئيسية',
        'nav_grades': 'الصفوف',
        'nav_dashboard': 'لوحة التحكم',
        'nav_admin': 'لوحة الإدارة',
        'nav_login': 'تسجيل الدخول',
        'nav_register': 'حساب جديد',
        'nav_logout': 'تسجيل خروج',
        'hero_title': 'ابدأ رحلة التعلم الخاصة بك',
        'hero_subtitle': 'محتوى تعليمي مرئي متميز مصمم لجميع الصفوف. اربح عملات، وافتح المعرفة، وتتبع تقدمك.',
        'btn_start': 'ابدأ الآن',
        'btn_grade1': 'الصف الأول',
        'btn_grade2': 'الصف الثاني',
        'btn_grade3': 'الصف الثالث',
        'coins_balance': 'رصيد العملات:',
        'redeem_code': 'استرداد كود',
        'enter_code': 'أدخل كود من 8 أحرف',
        'btn_redeem': 'استرداد',
        'unlock_video': 'فتح بـ 1 عملة',
        'play_video': 'تشغيل الفيديو',
        'locked': 'مغلق',
        'unlocked': 'مفتوح',
        'login_title': 'مرحباً بعودتك',
        'register_title': 'إنشاء حساب',
        'email': 'البريد الإلكتروني',
        'password': 'كلمة المرور',
        'name': 'الاسم الكامل',
        'admin_generate': 'إنشاء 500 كود',
        'admin_print': 'طباعة الأكواد',
        'stats_total_codes': 'إجمالي الأكواد',
        'stats_used_codes': 'الأكواد المستخدمة',
        'dev_title': 'مطور المنصة',
        'dev_name': 'Keryakos Alkis',
        'dev_role': 'Full Stack Developer & DevOps Engineer',
        'dev_desc': 'مطور برمجيات شغوف متخصص في بناء تطبيقات ويب وهواتف محمول قابلة للتطوير. ذو خبرة في تطوير فلاتر والأنظمة الخلفية والنشر السحابي وممارسات DevOps. أركز على إنشاء تطبيقات عالية الأداء وبنية تحتية موثوقة تقدم تجارب مستخدم سلسة.',
        'dev_skill1': 'مطور',
        'dev_skill2': 'DevOps',
        'dev_skill3': 'بنية الأنظمة',
        'nav_live_exams': '⏳ الامتحانات الحالية',
        'nav_messages': '📩 الرسائل',
        'msg_title': '📬 رسائلك'
    }
};

class I18n {
    constructor() {
        this.lang = localStorage.getItem('lang') || 'en';
        this.applyLanguage();
    }

    setLanguage(lang) {
        if (lang === 'ar' || lang === 'en') {
            this.lang = lang;
            localStorage.setItem('lang', lang);
            this.applyLanguage();
        }
    }

    applyLanguage() {
        document.documentElement.setAttribute('dir', this.lang === 'ar' ? 'rtl' : 'ltr');
        document.documentElement.lang = this.lang;
        
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (translations[this.lang][key]) {
                if (el.tagName === 'INPUT' && el.type === 'text') {
                    el.placeholder = translations[this.lang][key];
                } else {
                    el.textContent = translations[this.lang][key];
                }
            }
        });
    }

    t(key) {
        return translations[this.lang][key] || key;
    }
}

window.i18n = new I18n();
