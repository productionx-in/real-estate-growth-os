// app/forms/embed.js/route.ts
// Serves the client-side JavaScript embed runtime for customer project websites.
// Injects responsive enquiry forms, captures UTMs/referrers, manages honeypots, and submits to /api/forms/submit.

import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin || 'https://app.productionx.com'

  const jsContent = `/**
 * REGrow - Real Estate Growth OS Embeddable Enquiry Form Runtime
 * Lightweight, zero-dependency, responsive lead capture widget.
 */
(function() {
  'use strict';

  function initProductionXForms() {
    var containers = document.querySelectorAll('#productionx-enquiry-form, [data-productionx-form]');
    if (!containers || containers.length === 0) return;

    // Read UTM parameters from current URL
    var params = new URLSearchParams(window.location.search || '');
    var utmSource = params.get('utm_source');
    var utmMedium = params.get('utm_medium');
    var utmCampaign = params.get('utm_campaign');
    var utmTerm = params.get('utm_term');
    var utmContent = params.get('utm_content');

    containers.forEach(function(container) {
      if (container.getAttribute('data-px-initialized') === 'true') return;
      container.setAttribute('data-px-initialized', 'true');

      var connectionId = container.getAttribute('data-connection-id') || '';
      var projectId = container.getAttribute('data-project-id') || '';
      var title = container.getAttribute('data-title') || 'Enquire Now';
      var buttonText = container.getAttribute('data-button') || 'Schedule Site Visit';
      var theme = container.getAttribute('data-theme') || '#2563eb';
      var formLoadTime = Date.now();

      if (!connectionId) {
        console.warn('[REGrow] Missing data-connection-id on enquiry form container.');
        return;
      }

      var formHtml = [
        '<div class="px-form-wrapper" style="box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,\\'Segoe UI\\',Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">',
        '  <h3 style="margin:0 0 16px 0;font-size:1.25rem;font-weight:700;color:#0f172a;text-align:center;">' + escapeHtml(title) + '</h3>',
        '  <form class="px-form" style="display:flex;flex-direction:column;gap:12px;">',
        '    <div style="display:none !important;visibility:hidden !important;opacity:0 !important;position:absolute !important;left:-9999px !important;" aria-hidden="true">',
        '      <input type="text" name="hpConfirm" tabindex="-1" autocomplete="off" />',
        '      <input type="text" name="website_url_hp" tabindex="-1" autocomplete="off" />',
        '    </div>',
        '    <div>',
        '      <label style="display:block;font-size:0.875rem;font-weight:600;color:#334155;margin-bottom:4px;">Full Name *</label>',
        '      <input type="text" name="name" required placeholder="Enter your full name" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cbd5e1;border-radius:6px;font-size:0.95rem;outline:none;" />',
        '    </div>',
        '    <div>',
        '      <label style="display:block;font-size:0.875rem;font-weight:600;color:#334155;margin-bottom:4px;">Phone Number *</label>',
        '      <input type="tel" name="phone" required placeholder="+91 98765 43210" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cbd5e1;border-radius:6px;font-size:0.95rem;outline:none;" />',
        '    </div>',
        '    <div>',
        '      <label style="display:block;font-size:0.875rem;font-weight:600;color:#334155;margin-bottom:4px;">Email Address</label>',
        '      <input type="email" name="email" placeholder="name@example.com" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cbd5e1;border-radius:6px;font-size:0.95rem;outline:none;" />',
        '    </div>',
        '    <div>',
        '      <label style="display:block;font-size:0.875rem;font-weight:600;color:#334155;margin-bottom:4px;">Unit Preference</label>',
        '      <select name="unitPreference" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cbd5e1;border-radius:6px;font-size:0.95rem;background:#fff;outline:none;">',
        '        <option value="">Select preference (Optional)</option>',
        '        <option value="2 BHK Apartment">2 BHK Apartment</option>',
        '        <option value="3 BHK Apartment">3 BHK Apartment</option>',
        '        <option value="4 BHK Luxury Villa">4 BHK Luxury Villa</option>',
        '        <option value="Plot / Land">Residential Plot</option>',
        '        <option value="Commercial Space">Commercial / Office</option>',
        '      </select>',
        '    </div>',
        '    <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">',
        '      <input type="checkbox" name="scheduleSiteVisit" id="px-sv-' + Math.random().toString(36).substring(7) + '" value="true" checked style="width:16px;height:16px;cursor:pointer;" />',
        '      <label style="font-size:0.875rem;color:#475569;cursor:pointer;">I want to schedule an on-site property tour</label>',
        '    </div>',
        '    <div class="px-status" style="display:none;padding:10px;border-radius:6px;font-size:0.875rem;text-align:center;"></div>',
        '    <button type="submit" class="px-submit-btn" style="cursor:pointer;margin-top:8px;padding:12px 16px;background:' + escapeHtml(theme) + ';color:#ffffff;border:none;border-radius:6px;font-size:1rem;font-weight:600;transition:opacity 0.2s;">' + escapeHtml(buttonText) + '</button>',
        '  </form>',
        '</div>'
      ].join('\\n');

      container.innerHTML = formHtml;

      var form = container.querySelector('form');
      var statusEl = container.querySelector('.px-status');
      var submitBtn = container.querySelector('.px-submit-btn');

      form.addEventListener('submit', function(e) {
        e.preventDefault();

        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.6';
        submitBtn.innerText = 'Submitting...';
        statusEl.style.display = 'none';

        var formData = new FormData(form);
        var payload = {
          connectionId: connectionId,
          projectId: projectId || undefined,
          name: formData.get('name'),
          phone: formData.get('phone'),
          email: formData.get('email') || undefined,
          unitPreference: formData.get('unitPreference') || undefined,
          scheduleSiteVisit: formData.get('scheduleSiteVisit') === 'true',
          hpConfirm: formData.get('hpConfirm') || '',
          website_url_hp: formData.get('website_url_hp') || '',
          formLoadTime: formLoadTime,
          submissionTime: Date.now(),
          utmSource: utmSource || undefined,
          utmMedium: utmMedium || undefined,
          utmCampaign: utmCampaign || undefined,
          utmTerm: utmTerm || undefined,
          utmContent: utmContent || undefined,
          pageUrl: window.location.href,
          referrer: document.referrer || undefined
        };

        fetch('${origin}/api/forms/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        .then(function(res) {
          return res.json().then(function(data) {
            return { ok: res.ok, data: data };
          });
        })
        .then(function(res) {
          if (res.ok && res.data.success) {
            statusEl.style.display = 'block';
            statusEl.style.background = '#ecfdf5';
            statusEl.style.color = '#065f46';
            statusEl.style.border = '1px solid #a7f3d0';
            statusEl.innerText = res.data.message || 'Thank you! We will contact you shortly.';
            form.reset();
            submitBtn.style.display = 'none';
          } else {
            throw new Error(res.data.error || 'Submission failed.');
          }
        })
        .catch(function(err) {
          statusEl.style.display = 'block';
          statusEl.style.background = '#fef2f2';
          statusEl.style.color = '#991b1b';
          statusEl.style.border = '1px solid #fecaca';
          statusEl.innerText = err.message || 'Unable to submit enquiry. Please try again.';
          submitBtn.disabled = false;
          submitBtn.style.opacity = '1';
          submitBtn.innerText = buttonText;
        });
      });
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProductionXForms);
  } else {
    initProductionXForms();
  }
})();
`

  return new NextResponse(jsContent, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
