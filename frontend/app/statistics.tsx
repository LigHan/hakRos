import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { authorized } from '@/lib/statistics';
type Metric = 'search' | 'search_no_results' | 'card_view' | 'favorite_added' | 'like_added' | 'route_requested' | 'share_initiated';
type Data = { role: 'admin' | 'company' | 'user'; counts: Record<Metric, number>; categories: { category: string; n: number }[] };
const names: Record<Metric,string> = { search:'Запросы поиска', search_no_results:'Поиски без результатов', card_view:'Открытия карточек', favorite_added:'Добавления в избранное', like_added:'Отметки «Нравится»', route_requested:'Запросы маршрута', share_initiated:'Нажатия «Поделиться»' };
export default function StatisticsPage() {
 const [data,setData]=useState<Data|null>(null), [loading,setLoading]=useState(true), [error,setError]=useState('');
 const load=useCallback(async()=>{setLoading(true);setError('');try{setData(await authorized('/api/statistics'));}catch(e){setError(e instanceof Error?e.message:'Ошибка загрузки');}finally{setLoading(false);}},[]);
 useFocusEffect(useCallback(()=>{void load();},[load]));
 const title=data?.role==='admin'?'Статистика сервиса':data?.role==='company'?'Статистика вашей компании':'Моя активность';
 return <ScrollView contentContainerStyle={styles.page}><Text style={styles.title}>{title}</Text><Text style={styles.info}>События за последние 30 дней</Text>{loading?<ActivityIndicator/>:error?<View><Text style={styles.error}>{error}</Text><Pressable onPress={()=>void load()}><Text style={styles.link}>Повторить</Text></Pressable></View>:data?<><View style={styles.grid}>{(Object.keys(names) as Metric[]).filter(k=>data.role!=='company'||(k!=='search'&&k!=='search_no_results')).map(k=><View style={styles.card} key={k}><Text style={styles.label}>{names[k]}</Text><Text style={styles.count}>{data.counts[k]}</Text></View>)}</View><Text style={styles.heading}>Категории просмотренных мест</Text>{data.categories.length ? data.categories.map(c=><View key={c.category} style={styles.row}><Text>{c.category}</Text><Text>{c.n}</Text></View>):<Text style={styles.info}>Просмотров пока нет</Text>}<Text style={styles.info}>Числа показывают действия, а не уникальных людей. «Поделиться» учитывает нажатие кнопки, а не успешную отправку.</Text></>:null}</ScrollView>;
}
const styles=StyleSheet.create({page:{padding:20,gap:14,backgroundColor:'#f4f6fb',flexGrow:1},title:{fontSize:26,fontWeight:'700',color:'#18213a'},info:{color:'#62708a'},error:{color:'#b42318'},link:{color:'#2563eb',marginTop:12},grid:{flexDirection:'row',flexWrap:'wrap',gap:12},card:{backgroundColor:'#fff',borderRadius:12,padding:16,minWidth:150,flexGrow:1},label:{color:'#62708a'},count:{fontSize:30,fontWeight:'700',marginTop:8,color:'#18213a'},heading:{fontWeight:'700',fontSize:18},row:{backgroundColor:'#fff',borderRadius:8,padding:12,flexDirection:'row',justifyContent:'space-between'}});

