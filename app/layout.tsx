import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import './premium-fixes.css'

export const metadata: Metadata = {
  title: 'Foco em Canto | Mentoria Vocal',
  description: 'Libere o verdadeiro potencial da sua voz e aprenda a cantar com confiança e potência mesmo do zero.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <Script id="meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '392375800147182');
            fbq('track', 'PageView');
          `}
        </Script>
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: 'none' }}
            src="https://www.facebook.com/tr?id=392375800147182&ev=PageView&noscript=1"
            alt=""
          />
        </noscript>
        <Script id="kiwify-utm-preserver" strategy="afterInteractive">
          {`
            (function() {
              var prefixes = ['https://pay.kiwify.com.br'];
              var currentParams = new URLSearchParams(window.location.search);

              if (!currentParams.toString()) {
                return;
              }

              var sckValues = [
                currentParams.get('utm_source') || '',
                currentParams.get('utm_medium') || '',
                currentParams.get('utm_campaign') || '',
                currentParams.get('utm_term') || '',
                currentParams.get('utm_content') || ''
              ];

              document.querySelectorAll('a').forEach(function(anchor) {
                var shouldUpdate = prefixes.some(function(prefix) {
                  return anchor.href.indexOf(prefix) !== -1;
                });

                if (!shouldUpdate) {
                  return;
                }

                var checkoutUrl = new URL(anchor.href);

                currentParams.forEach(function(value, key) {
                  if (!checkoutUrl.searchParams.has(key)) {
                    checkoutUrl.searchParams.set(key, value);
                  }
                });

                if (!checkoutUrl.searchParams.has('sck')) {
                  checkoutUrl.searchParams.set('sck', sckValues.join('|'));
                }

                anchor.href = checkoutUrl.toString();
              });
            })();
          `}
        </Script>
      </body>
    </html>
  )
}
