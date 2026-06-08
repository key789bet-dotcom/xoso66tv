/**
 * Captcha SVG don gian (5 chu so, mau khac nhau, gach cheo)
 * Su dung: renderCaptcha('captchaBox') -> sinh SVG va luu vao window.__captchaCode
 */
(function(){
'use strict';

var COLORS = ['#e74c3c','#3498db','#27ae60','#f39c12','#9b59b6','#1abc9c','#e91e63'];

function rand(min, max){ return Math.floor(Math.random()*(max-min+1)) + min; }
function pick(arr){ return arr[rand(0, arr.length-1)]; }

function genCode(len){
  var s = '';
  for (var i=0;i<len;i++) s += rand(0, 9);
  return s;
}

window.renderCaptcha = function(boxId){
  var box = document.getElementById(boxId);
  if (!box) return '';
  var code = genCode(5);
  window.__captchaCode = code;

  var W = 130, H = 44;
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="100%" style="background:#fff;border-radius:6px">';

  // 4-5 strikethrough lines (light colors, low opacity)
  var lineCount = rand(3, 5);
  for (var k=0;k<lineCount;k++){
    var x1 = rand(0, 30), y1 = rand(5, H-5);
    var x2 = rand(W-30, W), y2 = rand(5, H-5);
    svg += '<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+pick(COLORS)+'" stroke-width="1.5" opacity="0.6"/>';
  }

  // Digits
  var xStep = W / 6;
  for (var i=0;i<code.length;i++){
    var d = code[i];
    var x = xStep * (i+1);
    var y = rand(H/2+8, H/2+12);
    var rot = rand(-25, 25);
    var color = pick(COLORS);
    var fontSize = rand(22, 28);
    svg += '<text x="'+x+'" y="'+y+'" font-family="Arial Black,sans-serif" font-size="'+fontSize+'" font-weight="900" fill="'+color+'" text-anchor="middle" transform="rotate('+rot+' '+x+' '+y+')" style="user-select:none">'+d+'</text>';
  }

  // 2 more dot noises
  for (var n=0;n<25;n++){
    svg += '<circle cx="'+rand(0,W)+'" cy="'+rand(0,H)+'" r="'+rand(1,2)+'" fill="'+pick(COLORS)+'" opacity="0.5"/>';
  }

  svg += '</svg>';
  box.innerHTML = svg;
  return code;
};

window.verifyCaptcha = function(input){
  var code = String(window.__captchaCode || '');
  return String(input || '').trim() === code;
};

})();
