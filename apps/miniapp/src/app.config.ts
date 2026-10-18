export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/catalog/index',
    'pages/scene/index',
    'pages/jd/index',
    'pages/review/index',
    'pages/analysis/index',
    'pages/quiz/index',
    'pages/result/index',
    'pages/path/index',
    'pages/course/index',
    'pages/plans/index',
    'pages/engineering/index',
  ],
  window: {
    backgroundTextStyle: 'dark',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTitleText: 'AI成长课',
    navigationBarTextStyle: 'black',
  },
  tabBar: {
    color: '#667085',
    selectedColor: '#1668dc',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '首页',
        iconPath: 'assets/prototype-icons/home.png',
        selectedIconPath: 'assets/prototype-icons/home.png',
      },
      {
        pagePath: 'pages/catalog/index',
        text: '学习场景',
        iconPath: 'assets/prototype-icons/grid.png',
        selectedIconPath: 'assets/prototype-icons/grid.png',
      },
      {
        pagePath: 'pages/plans/index',
        text: '我的学习',
        iconPath: 'assets/prototype-icons/route.png',
        selectedIconPath: 'assets/prototype-icons/route.png',
      },
    ],
  },
});
